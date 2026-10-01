import type { AgentToolName } from "./contracts";

export interface NativeToolDefinition {
  type: "function";
  function: {
    name: AgentToolName;
    description: string;
    parameters: Record<string, unknown>;
  };
}

const DEFINITIONS: Record<AgentToolName, NativeToolDefinition> = {
  calculator: {
    type: "function",
    function: {
      name: "calculator",
      description: "Perform one exact arithmetic operation. Use this instead of mental arithmetic.",
      parameters: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "subtract", "multiply", "divide", "percent_of"], description: "Arithmetic operation." },
          a: { type: "number", description: "First operand." },
          b: { type: "number", description: "Second operand. For percent_of, this is the percentage." },
          precision: { type: "integer", minimum: 0, maximum: 12, default: 6, description: "Decimal precision for display." },
        },
        required: ["op", "a", "b"],
      },
    },
  },  code_solver: {
    type: "function",
    function: {
      name: "code_solver",
      description: "Solve a bounded code or logic task and return a structured result.",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The exact code or logic task to solve." },
        },
        required: ["task"],
      },
    },
  },
  web_search: {
    type: "function",
    function: {
      name: "web_search",
      description: "Search the public web for current factual evidence.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Focused search query." },
        },
        required: ["query"],
      },
    },
  },  web_fetch: {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch one selected public URL for evidence.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "Absolute public URL to inspect." },
        },
        required: ["url"],
      },
    },
  },
  evidence_verify: {
    type: "function",
    function: {
      name: "evidence_verify",
      description: "Verify claims against already gathered evidence.",
      parameters: {
        type: "object",
        properties: {
          claim: { type: "string", description: "Claim to verify." },
        },
        required: ["claim"],
      },
    },
  },
};

export function nativeToolDefinitions(names: readonly string[]): NativeToolDefinition[] {
  return names.flatMap((name) => name in DEFINITIONS ? [{ ...DEFINITIONS[name as AgentToolName] }] : []);
}
