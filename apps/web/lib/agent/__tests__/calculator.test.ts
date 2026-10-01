import { describe, expect, it } from "vitest";
import { runCalculator } from "../calculator";

describe("runCalculator", () => {
  it("keeps procurement arithmetic exact without model-computed intermediates", () => {
    const result = runCalculator({
      precision: 6,
      operations: [
        { op: "multiply", a: 240, b: "42.500" },
        { op: "percent_of", a: { step: 0 }, b: 93 },
        { op: "add", a: { step: 1 }, b: 385 },
        { op: "percent_of", a: { step: 2 }, b: 5 },
        { op: "add", a: { step: 2 }, b: { step: 3 } },
        { op: "add", a: { step: 4 }, b: 95 },
        { op: "divide", a: { step: 5 }, b: 240 },
      ],
    });

    expect(result.steps.map((step) => step.value)).toEqual([
      "10200",
      "9486",
      "9871",
      "493.55",
      "10364.55",
      "10459.55",
      "43.581458",
    ]);
    expect(result.final).toBe("43.581458");
  });

  it("rejects division by zero", () => {
    expect(() => runCalculator({ operations: [{ op: "divide", a: 1, b: 0 }] })).toThrow("CALCULATOR_DIVIDE_BY_ZERO");
  });

  it("rejects forward step references", () => {
    expect(() => runCalculator({ operations: [{ op: "add", a: { step: 0 }, b: 1 }] })).toThrow("CALCULATOR_INVALID_STEP_REFERENCE");
  });
});
