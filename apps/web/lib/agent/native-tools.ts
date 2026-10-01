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
      description: "Perform exact arithmetic. For a multi-step business calculation, send all required formulas in expressions so every requested figure is computed deterministically in one tool call. Never calculate mentally.",
      parameters: {
        type: "object",
        properties: {
          op: { type: "string", enum: ["add", "subtract", "multiply", "divide", "percent_of"], description: "Single arithmetic operation when only one result is needed." },
          a: { type: "number", description: "First operand for a single operation." },
          b: { type: "number", description: "Second operand for a single operation. For percent_of, this is the percentage." },
          expressions: {
            type: "array",
            description: "For multi-step work, calculate every requested output here. Expressions allow only numbers, +, -, *, /, parentheses and decimals. Do not use commas or percent signs; write 7% as 0.07.",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Short result name." },
                expression: { type: "string", description: "Exact arithmetic expression using the values from the user request." },
              },
              required: ["label", "expression"],
            },
          },
          precision: { type: "integer", minimum: 0, maximum: 12, default: 6, description: "Decimal precision for display." },
        },
        required: [],
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
