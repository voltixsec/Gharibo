import { z } from "zod";
import type { AgentPlan, AgentToolCall } from "./contracts";

const calculatorOperationSchema = z.discriminatedUnion("op", [
  z.object({ op: z.enum(["add", "subtract", "multiply", "divide"]), a: z.union([z.string(), z.number()]), b: z.union([z.string(), z.number()]) }),
  z.object({ op: z.literal("percent_of"), a: z.union([z.string(), z.number()]), b: z.union([z.string(), z.number()]) }),
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
  if (value.canAnswerDirectly && value.toolCalls.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A direct answer cannot include tool calls." });
  }
});

export function buildPlannerSystemPrompt(allowedTools: readonly string[]): string {
  return [
    "You are the bounded planner for GHARIBO Agent.",
    "Return ONLY valid JSON. Do not include markdown or hidden reasoning.",
    "Choose tools only when they materially improve correctness.",
    "Never do arithmetic mentally when calculator is available.",
    "Never claim web facts without web_search/web_fetch evidence.",
    `Allowed tools: ${allowedTools.join(", ") || "none"}.`,
    "Schema:",
    '{"canAnswerDirectly":boolean,"toolCalls":[{"id":"short-id","name":"tool-name","input":{}}]}',
  ].join("\n");
}

export function parseAgentPlan(raw: string): AgentPlan {
  const text = raw.trim();
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new Error("AGENT_PLAN_INVALID_JSON");
  }
  const parsed = planSchema.safeParse(decoded);
  if (!parsed.success) throw new Error(`AGENT_PLAN_INVALID:${parsed.error.issues.map((issue) => issue.message).join(";")}`);
  return {
    canAnswerDirectly: parsed.data.canAnswerDirectly,
    toolCalls: parsed.data.toolCalls as AgentToolCall[],
  };
}
