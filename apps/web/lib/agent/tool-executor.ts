import type { AgentToolCall, AgentToolResult } from "./contracts";
import { runCalculator, type CalculatorRequest } from "./calculator";

export interface AgentToolAdapters {
  codeSolver?: (input: unknown) => Promise<unknown>;
  webSearch?: (input: unknown) => Promise<unknown>;
  webFetch?: (input: unknown) => Promise<unknown>;
  evidenceVerify?: (input: unknown) => Promise<unknown>;
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
      const request: CalculatorRequest = Array.isArray(raw.operations)
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

    const adapter = call.name === "code_solver"
      ? adapters.codeSolver
      : call.name === "web_search"
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

    return { callId: call.id, name: call.name, ok: true, data: await adapter(call.input) };
  } catch (error) {
    return {
      callId: call.id,
      name: call.name,
      ok: false,
      error: {
        code: error instanceof Error && /^[A-Z][A-Z0-9_:.-]+$/.test(error.message) ? error.message.split(":")[0] : "AGENT_TOOL_FAILED",
        message: error instanceof Error ? error.message : "Agent tool failed.",
      },
    };
  }
}
