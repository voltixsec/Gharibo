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

  it("evaluates a full procurement deal in one exact batch", () => {
    const result = runCalculator({ precision: 6, expressions: [
      { label: "gross_goods", expression: "240 * 42.5" },
      { label: "discounted_goods", expression: "(240 * 42.5) * (1 - 0.07)" },
      { label: "customs", expression: "(((240 * 42.5) * (1 - 0.07)) + 385) * 0.05" },
      { label: "landed", expression: "((240 * 42.5) * (1 - 0.07)) + 385 + ((((240 * 42.5) * (1 - 0.07)) + 385) * 0.05) + 95" },
      { label: "sales", expression: "240 * 49.9" },
      { label: "profit", expression: "(240 * 49.9) - (((240 * 42.5) * (1 - 0.07)) + 385 + ((((240 * 42.5) * (1 - 0.07)) + 385) * 0.05) + 95)" },
    ] });
    expect(result.expressions.map((item) => item.value)).toEqual([
      "10200", "9486", "493.55", "10459.55", "11976", "1516.45",
    ]);
  });
});
