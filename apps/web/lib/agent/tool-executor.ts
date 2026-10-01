import type { AgentEvidence, AgentToolCall, AgentToolResult } from "./contracts";
import { runCalculator, type CalculatorRequest } from "./calculator";
import { solveLogic, type LogicSolverRequest } from "./logic-solver";

export interface AgentToolAdapters {
  codeSolver?: (input: unknown) => Promise<unknown>;
  webSearch?: (input: unknown) => Promise<unknown>;
  webFetch?: (input: unknown) => Promise<unknown>;
  evidenceVerify?: (input: unknown) => Promise<unknown>;
}

export interface AgentToolAdapterResult<TData = unknown> {
  agentToolResult: true;
  data: TData;
  evidence?: AgentEvidence[];
}

export function agentToolAdapterResult<TData>(data: TData, evidence: AgentEvidence[] = []): AgentToolAdapterResult<TData> {
  return { agentToolResult: true, data, evidence };
}

function unpackAdapterResult(value: unknown): { data: unknown; evidence?: AgentEvidence[] } {
  if (value && typeof value === "object" && (value as { agentToolResult?: unknown }).agentToolResult === true) {
    const envelope = value as AgentToolAdapterResult;
    return { data: envelope.data, evidence: envelope.evidence };
  }
  return { data: value };
}

export async function executeAgentTool(call: AgentToolCall, adapters: AgentToolAdapters = {}): Promise<AgentToolResult> {
  try {
    if (call.name === "calculator") {
      const raw = call.input as Partial<CalculatorRequest> & {
        op?: "add" | "subtract" | "multiply" | "divide" | "percent_of";
        a?: string | number;
        b?: string | number;
        precision?: number;
      };
      const request: CalculatorRequest = Array.isArray(raw.operations) || Array.isArray((raw as Partial<CalculatorRequest>).expressions)
        ? raw as CalculatorRequest
        : {
            operations: [{
              op: raw.op ?? "add",
              a: raw.a ?? 0,
              b: raw.b ?? 0,
            }],
            precision: raw.precision,
          };
      return { callId: call.id, name: call.name, ok: true, data: runCalculator(request) };
    }

    if (call.name === "code_solver") {
      return { callId: call.id, name: call.name, ok: true, data: solveLogic(call.input as LogicSolverRequest) };
    }

    const adapter = call.name === "web_search"
      ? adapters.webSearch
      : call.name === "web_fetch"
          ? adapters.webFetch
          : adapters.evidenceVerify;

    if (!adapter) {
      return {
        callId: call.id,
        name: call.name,
        ok: false,
        error: { code: "AGENT_TOOL_NOT_CONNECTED", message: `${call.name} is not connected.` },
      };
    }

    const unpacked = unpackAdapterResult(await adapter(call.input));
    return {
      callId: call.id,
      name: call.name,
      ok: true,
      data: unpacked.data,
      ...(unpacked.evidence?.length ? { evidence: unpacked.evidence } : {}),
    };
  } catch (error) {
    const candidateCode = error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
      ? (error as { code: string }).code
      : null;
    const messageCode = error instanceof Error && /^[A-Z][A-Z0-9_:.-]+$/.test(error.message)
      ? error.message.split(":")[0]
      : null;
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      error: {
        code: candidateCode ?? messageCode ?? "AGENT_TOOL_FAILED",
        message: error instanceof Error ? error.message : "Agent tool failed.",
      },
    };
  }
}
