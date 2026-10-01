import { randomUUID } from "node:crypto";
import type { Message } from "@gharibo/shared";
import type { AgentActivityEvent, AgentToolResult, AgentTurnResult } from "./contracts";
import { buildPlannerSystemPrompt, parseAgentPlan } from "./planner";
import { routeAgentCapabilities } from "./registry";
import { executeAgentTool, type AgentToolAdapters } from "./tool-executor";

export interface AgentModelRequest {
  messages: Message[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export type AgentModelCall = (request: AgentModelRequest) => Promise<string>;

export interface RunAgentTurnInput {
  messages: Message[];
  modelCall: AgentModelCall;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  adapters?: AgentToolAdapters;
  now?: () => Date;
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
    error: result.error ?? null,
  })).join("\n");
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<AgentTurnResult> {
  const now = input.now ?? (() => new Date());
  const goal = lastUserMessage(input.messages);
  const capabilities = routeAgentCapabilities(goal);
  const allowedTools = capabilities.filter((capability) => capability.id !== "gharibo_model").map((capability) => capability.id);
  const activity: AgentActivityEvent[] = [event(now, "PLANNING", "Planning the request", "RUNNING")];

  let plan;
  try {
    const rawPlan = await input.modelCall({
      messages: [{ role: "user", content: compactPlannerContext(input.messages) }],
      systemPrompt: buildPlannerSystemPrompt(allowedTools),
      temperature: 0,
      maxTokens: 512,
    });
    plan = parseAgentPlan(rawPlan);
  } catch (error) {
    activity.push(event(now, "PLANNING", "Planning failed", "FAILED"));
    throw new Error(`AGENT_PLANNING_FAILED:${error instanceof Error ? error.message : "unknown"}`);
  }

  const requiredCalculator = allowedTools.includes("calculator");
  if (requiredCalculator && !plan.toolCalls.some((call) => call.name === "calculator")) {
    activity.push(event(now, "PLANNING", "Required calculator was omitted", "FAILED"));
    throw new Error("AGENT_REQUIRED_TOOL_OMITTED:calculator");
  }
  if (plan.toolCalls.some((call) => !allowedTools.includes(call.name))) {
    activity.push(event(now, "PLANNING", "Planner requested a disallowed tool", "FAILED"));
    throw new Error("AGENT_DISALLOWED_TOOL");
  }

  activity[0] = { ...activity[0]!, status: "DONE" };
  const toolResults: AgentToolResult[] = [];

  for (const call of plan.toolCalls.slice(0, 8)) {
    const started = event(now, "USING_TOOL", `Using ${call.name}`, "RUNNING", call.name);
    activity.push(started);
    const result = await executeAgentTool(call, input.adapters);
    toolResults.push(result);
    activity[activity.length - 1] = { ...started, status: result.ok ? "DONE" : "FAILED" };
    if (!result.ok) throw new Error(`AGENT_TOOL_FAILED:${call.name}:${result.error?.code ?? "UNKNOWN"}`);
  }

  activity.push(event(now, "CALLING_MODEL", "Preparing the final answer", "RUNNING"));
  const groundedSystem = [
    input.systemPrompt ?? "",
    "You are GHARIBO-V1 operating inside GHARIBO Agent.",
    "Use tool results as authoritative for deterministic calculations and retrieved evidence.",
    "Do not recompute calculator results mentally. Do not invent missing facts.",
    toolResults.length ? `TOOL_RESULTS:\n${toolContext(toolResults)}` : "",
  ].filter(Boolean).join("\n\n");

  const answer = await input.modelCall({
    messages: input.messages,
    systemPrompt: groundedSystem,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
  });
  activity[activity.length - 1] = { ...activity[activity.length - 1]!, status: "DONE" };

  const evidence = toolResults.flatMap((result) => result.evidence ?? []);
  activity.push(event(now, "COMPLETED", "Completed", "DONE"));
  return { answer, toolResults, activity, evidence, verified: evidence.length > 0 ? toolResults.every((result) => result.ok) : toolResults.every((result) => result.ok) };
}
