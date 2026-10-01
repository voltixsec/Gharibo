import { describe, expect, it } from "vitest";
import { parseAgentPlan } from "../planner";

describe("parseAgentPlan", () => {
  it("accepts a fenced JSON plan while still validating its schema", () => {
    const plan = parseAgentPlan(`Here is the plan:\n\n\`\`\`json\n{"canAnswerDirectly":false,"toolCalls":[{"id":"calc-1","name":"calculator","input":{"operations":[{"op":"multiply","a":240,"b":"42.500"}]}}]}\n\`\`\``);
    expect(plan.canAnswerDirectly).toBe(false);
    expect(plan.toolCalls[0]?.name).toBe("calculator");
  });

  it("rejects prose with no JSON object", () => {
    expect(() => parseAgentPlan("I would use the calculator.")).toThrow("AGENT_PLAN_INVALID_JSON");
  });
});
