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

  it("uses native tool selection when a selector is connected", async () => {
    const modelCall = vi.fn<AgentModelCall>().mockImplementation(async (request) => {
      expect(request.systemPrompt).toContain('"final":"258.33"');
      return "USD 258.33/MT";
    });
    const toolSelector = vi.fn().mockResolvedValue({
      toolCall: {
        id: "call-1",
        name: "calculator",
        input: { op: "divide", a: 6200, b: 24, precision: 2 },
      },
      answer: null,
    });

    const result = await runAgentTurn({
      messages: [{ role: "user", content: "Calculate freight per MT: USD 6,200 / 24 MT" }],
      modelCall,
      toolSelector,
    });

    expect(result.answer).toBe("USD 258.33/MT");
    expect(result.toolResults[0]?.data).toMatchObject({ final: "258.33" });
    expect(toolSelector).toHaveBeenCalledTimes(1);
    expect(modelCall).toHaveBeenCalledTimes(1);
  });

  it("repairs one invalid planner response before failing the turn", async () => {
    const repairedPlan = JSON.stringify({
      canAnswerDirectly: false,
      toolCalls: [{
        id: "calc-1",
        name: "calculator",
        input: { operations: [{ op: "multiply", a: 240, b: "42.500" }] },
      }],
    });
    const modelCall = vi.fn<AgentModelCall>()
      .mockResolvedValueOnce("I will calculate this carefully.")
      .mockResolvedValueOnce(repairedPlan)
      .mockResolvedValueOnce("KWD 10,200");

    const result = await runAgentTurn({
      messages: [{ role: "user", content: "Calculate 240 units at KWD 42.500 each" }],
      modelCall,
    });

    expect(result.answer).toBe("KWD 10,200");
    expect(result.toolResults[0]?.data).toMatchObject({ final: "10200" });
    expect(modelCall).toHaveBeenCalledTimes(3);
  });
});
