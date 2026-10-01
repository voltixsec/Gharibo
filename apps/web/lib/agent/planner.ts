import { z } from "zod";
import type { AgentPlan, AgentToolCall } from "./contracts";

const calculatorOperandSchema = z.union([
  z.string(),
  z.number(),
  z.object({ step: z.number().int().min(0).max(99) }),
]);

const calculatorOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.enum(["add", "subtract", "multiply", "divide"]), a: calculatorOperandSchema, b: calculatorOperandSchema }),
  z.object({ op: z.literal("percent_of"), a: calculatorOperandSchema, b: calculatorOperandSchema }),
]);

const toolCallSchema = z.discriminatedUnion("name", [
  z.object({ id: z.string().min(1).max(80), name: z.literal("calculator"), input: z.object({ operations: z.array(calculatorOperationSchema).min(1).max(100), precision: z.number().int().min(0).max(12).optional() }) }),
  z.object({ id: z.string().min(1).max(80), name: z.literal("code_solver"), input: z.record(z.unknown()) }),
  z.object({ id: z.string().min(1).max(80), name: z.literal("web_search"), input: z.object({ query: z.string().min(1).max(1000) }) }),
  z.object({ id: z.string().min(1).max(80), name: z.literal("web_fetch"), input: z.object({ url: z.string().url() }) }),
  z.object({ id: z.string().min(1).max(80), name: z.literal("evidence_verify"), input: z.record(z.unknown()) }),
]);

const planSchema = z.object({
  canAnswerDirectly: z.boolean(),
  toolCalls: z.array(toolCallSchema).max(8),
}).superRefine((value, ctx) => {
  if (value.canAnswerDirectly && value.toolCalls.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A direct answer cannot include tool calls." });
});

export function buildPlannerSystemPrompt(allowedTools: readonly string[]): string {
  return [
    "You are the bounded planner for GHARIBO Agent.",
    "Return ONLY valid JSON. Do not include markdown or hidden reasoning.",
    "Choose tools only when they materially improve correctness.",
    "Never do arithmetic mentally when calculator is available.",
    "For chained calculator work, reference an earlier exact result as {\"step\":0}, {\"step\":1}, etc. Never copy an intermediate value from memory.",
    "Never claim web facts without web_search/web_fetch evidence.",
    `Allowed tools: ${allowedTools.join(", ") || "none"}.`,
    "Schema:",
    '{"canAnswerDirectly":boolean,"toolCalls":[{"id":"short-id","name":"tool-name","input":{}}]}',
  ].join("\n");
}

function extractJsonObject(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error("AGENT_PLAN_INVALID_JSON");
  if (text.startsWith("{") && text.endsWith("}")) return text;

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)?.[1]?.trim();
  if (fenced?.startsWith("{") && fenced.endsWith("}")) return fenced;

  const start = text.indexOf("{");
  if (start < 0) throw new Error("AGENT_PLAN_INVALID_JSON");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  throw new Error("AGENT_PLAN_INVALID_JSON");
}

export function parseAgentPlan(raw: string): AgentPlan {
  let decoded: unknown;
  try { decoded = JSON.parse(extractJsonObject(raw)); }
  catch (error) {
    if (error instanceof Error && error.message === "AGENT_PLAN_INVALID_JSON") throw error;
    throw new Error("AGENT_PLAN_INVALID_JSON");
  }
  const parsed = planSchema.safeParse(decoded);
  if (!parsed.success) throw new Error(`AGENT_PLAN_INVALID:${parsed.error.issues.map((issue) => issue.message).join(";")}`);
  return { canAnswerDirectly: parsed.data.canAnswerDirectly, toolCalls: parsed.data.toolCalls as AgentToolCall[] };
}
