import { describe, expect, it, vi } from "vitest";
import { runAgentTurn, type AgentModelCall } from "../runtime";

describe("runAgentTurn", () => {
  it("forces arithmetic through the calculator before the final model answer", async () => {
    const modelCall = vi.fn<AgentModelCall>()
      .mockResolvedValueOnce(JSON.stringify({
        canAnswerDirectly: false,
        toolCalls: [{
          id: "calc-1",
          name: "calculator",
          input: { operations: [{ op: "divide", a: 6200, b: 24 }], precision: 6 },
        }],
      }))
      .mockImplementationOnce(async (request) => {
        expect(request.systemPrompt).toContain('"final":"258.333333"');
        return "USD 258.333333/MT";
      });

    const result = await runAgentTurn({
      messages: [{ role: "user", content: "Calculate freight per MT: USD 6,200 / 24 MT" }],
      modelCall,
    });

    expect(result.answer).toBe("USD 258.333333/MT");
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0]?.ok).toBe(true);
    expect(modelCall).toHaveBeenCalledTimes(2);
  });
});
