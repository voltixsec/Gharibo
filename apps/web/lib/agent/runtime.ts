import { randomUUID } from "node:crypto";
import type { Message } from "@gharibo/shared";
import type { AgentActivityEvent, AgentPlan, AgentToolCall, AgentToolResult, AgentTurnResult } from "./contracts";
import { buildPlannerSystemPrompt, parseAgentPlan } from "./planner";
import { routeAgentCapabilities } from "./registry";
import { nativeToolDefinitions, type NativeToolDefinition } from "./native-tools";
import { executeAgentTool, type AgentToolAdapters } from "./tool-executor";

export interface AgentModelRequest {
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export type AgentModelCall = (request: AgentModelRequest) => Promise<string>;

export interface AgentToolSelectionRequest {
  messages: Message[];
  tools: NativeToolDefinition[];
  systemPrompt?: string;
  maxTokens?: number;
}

export interface AgentToolSelection {
  toolCall: AgentToolCall | null;
  answer?: string | null;
}

export type AgentToolSelectorCall = (request: AgentToolSelectionRequest) => Promise<AgentToolSelection>;

export interface RunAgentTurnInput {
  messages: Message[];
  modelCall: AgentModelCall;
  toolSelector?: AgentToolSelectorCall;
  enabledTools?: AgentToolCall["name"][];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  adapters?: AgentToolAdapters;
  now?: () => Date;
  onActivity?: (activity: AgentActivityEvent) => void | Promise<void>;
}

function event(now: () => Date, stage: AgentActivityEvent["stage"], label: string, status: AgentActivityEvent["status"], tool?: AgentActivityEvent["tool"]): AgentActivityEvent {
  return { id: randomUUID(), stage, label, status, ...(tool ? { tool } : {}), at: now().toISOString() };
}

function lastUserMessage(messages: readonly Message[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return messages[index]!.content;
  }
  throw new Error("AGENT_USER_MESSAGE_REQUIRED");
}

function compactPlannerContext(messages: readonly Message[]): string {
  return messages.slice(-6).map((message) => `${message.role.toUpperCase()}: ${message.content.slice(0, 3000)}`).join("\n\n");
}

function toolContext(results: readonly AgentToolResult[]): string {
  return results.map((result) => JSON.stringify({
    tool: result.name,
    ok: result.ok,
    data: result.data ?? null,
    evidence: result.evidence ?? [],
    error: result.error ?? null,
  })).join("\n");
}

function hasTool(plan: AgentPlan, name: string): boolean {
  return plan.toolCalls.some((call) => call.name === name);
}

function plannerRepairPrompt(allowedTools: readonly string[], reason: "INVALID_JSON" | "MISSING_CALCULATOR"): string {
  return [
    buildPlannerSystemPrompt(allowedTools),
    reason === "INVALID_JSON"
      ? "CORRECTION: the previous planner response was not valid machine-readable JSON."
      : "CORRECTION: this request contains arithmetic and the calculator is mandatory.",
    "Return exactly ONE compact JSON object and nothing else.",
    "Do not explain the plan. Do not use markdown. Do not answer the user's question.",
    allowedTools.includes("calculator")
      ? "Include a calculator tool call. Break chained formulas into operations and use {\"step\":N} for prior exact results."
      : "Use only the allowed tools.",
  ].join("\n");
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<AgentTurnResult> {
  const now = input.now ?? (() => new Date());
  const goal = lastUserMessage(input.messages);
  const capabilities = routeAgentCapabilities(goal);
  const enabledTools = input.enabledTools ? new Set(input.enabledTools) : null;
  const allowedTools = capabilities
    .filter((capability) => capability.id !== "gharibo_model")
    .map((capability) => capability.id)
    .filter((name) => !enabledTools || enabledTools.has(name as AgentToolCall["name"]));
  const activity: AgentActivityEvent[] = [];
  const toolResults: AgentToolResult[] = [];
  const record = async (entry: AgentActivityEvent) => {
    activity.push(entry);
    await input.onActivity?.(entry);
  };

  if (allowedTools.length > 0) {
    await record(event(now, "PLANNING", input.toolSelector ? "Selecting the right tool" : "Planning the request", "RUNNING"));
    let selectedCalls: AgentToolCall[] = [];

    try {
      if (input.toolSelector) {
        const selection = await input.toolSelector({
          messages: input.messages.slice(-6),
          tools: nativeToolDefinitions(allowedTools),
          systemPrompt: [
            "You are the tool-selection layer for GHARIBO Agent.",
            "When a listed tool can materially improve correctness, call exactly one tool.",
            "For arithmetic, always call calculator instead of calculating mentally.",
            "Do not invent tool results.",
          ].join("\n"),
          maxTokens: 256,
        });
        if (selection.toolCall) selectedCalls = [selection.toolCall];
      } else {
        const plannerContext = compactPlannerContext(input.messages);
        const callPlanner = async (systemPrompt: string, maxTokens: number): Promise<string> => input.modelCall({
          messages: [{ role: "user", content: plannerContext }],
          systemPrompt,
          temperature: 0,
          maxTokens,
        });

        let plan: AgentPlan;
        const firstRaw = await callPlanner(buildPlannerSystemPrompt(allowedTools), 1024);
        try {
          plan = parseAgentPlan(firstRaw);
        } catch {
          const repairedRaw = await callPlanner(plannerRepairPrompt(allowedTools, "INVALID_JSON"), 1536);
          plan = parseAgentPlan(repairedRaw);
        }
        if (allowedTools.includes("calculator") && !hasTool(plan, "calculator")) {
          const repairedRaw = await callPlanner(plannerRepairPrompt(allowedTools, "MISSING_CALCULATOR"), 1536);
          plan = parseAgentPlan(repairedRaw);
        }
        selectedCalls = plan.toolCalls.slice(0, 8);
      }
    } catch (error) {
      activity[activity.length - 1] = { ...activity[activity.length - 1]!, status: "FAILED" };
      await input.onActivity?.(activity[activity.length - 1]!);
      throw new Error(`AGENT_PLANNING_FAILED:${error instanceof Error ? error.message : "unknown"}`);
    }

    if (allowedTools.includes("calculator") && !selectedCalls.some((call) => call.name === "calculator")) {
      activity[activity.length - 1] = { ...activity[activity.length - 1]!, status: "FAILED" };
      await input.onActivity?.(activity[activity.length - 1]!);
      throw new Error("AGENT_REQUIRED_TOOL_OMITTED:calculator");
    }
    if (selectedCalls.some((call) => !allowedTools.includes(call.name))) {
      activity[activity.length - 1] = { ...activity[activity.length - 1]!, status: "FAILED" };
      await input.onActivity?.(activity[activity.length - 1]!);
      throw new Error("AGENT_DISALLOWED_TOOL");
    }
    activity[activity.length - 1] = { ...activity[activity.length - 1]!, status: "DONE" };
    await input.onActivity?.(activity[activity.length - 1]!);

    for (const call of selectedCalls) {
      const started = event(now, "USING_TOOL", `Using ${call.name}`, "RUNNING", call.name);
      await record(started);
      const result = await executeAgentTool(call, input.adapters);
      toolResults.push(result);
      activity[activity.length - 1] = { ...started, status: result.ok ? "DONE" : "FAILED" };
      await input.onActivity?.(activity[activity.length - 1]!);
      if (!result.ok) throw new Error(`AGENT_TOOL_FAILED:${call.name}:${result.error?.code ?? "UNKNOWN"}`);
    }
  }

  await record(event(now, "CALLING_MODEL", "Preparing the final answer", "RUNNING"));
  const groundedSystem = [
    input.systemPrompt ?? "",
    toolResults.length ? "You are GHARIBO-V1 operating inside GHARIBO Agent." : "",
    toolResults.length ? "Use tool results as authoritative for deterministic calculations and retrieved evidence." : "",
    toolResults.length ? "Do not recompute calculator results mentally. Do not invent missing facts." : "",
    toolResults.length ? `TOOL_RESULTS:\n${toolContext(toolResults)}` : "",
  ].filter(Boolean).join("\n\n");

  const answer = await input.modelCall({
    messages: input.messages,
    systemPrompt: groundedSystem || input.systemPrompt,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  activity[activity.length - 1] = { ...activity[activity.length - 1]!, status: "DONE" };
  await input.onActivity?.(activity[activity.length - 1]!);

  const evidence = toolResults.flatMap((result) => result.evidence ?? []);
  await record(event(now, "COMPLETED", "Completed", "DONE"));
  return {
    answer,
    toolResults,
    activity,
    evidence,
    verified: toolResults.length > 0 && toolResults.every((result) => result.ok),
  };
}
