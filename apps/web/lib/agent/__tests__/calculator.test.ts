import { describe, expect, it } from "vitest";
import { runCalculator } from "../calculator";

describe("runCalculator", () => {
  it("keeps procurement arithmetic exact", () => {
    const result = runCalculator({
      precision: 6,
      operations: [
        { op: "multiply", a: 240, b: "42.500" },
        { op: "multiply", a: 10200, b: "0.93" },
        { op: "add", a: 9486, b: 385 },
        { op: "percent_of", a: 9871, b: 5 },
        { op: "add", a: "9486", b: "385" },
        { op: "add", a: "9871", b: "493.55" },
        { op: "add", a: "10364.55", b: "95" },
        { op: "divide", a: "10459.55", b: 240 },
      ],
    });

    expect(result.steps.map((step) => step.value)).toEqual([
      "10200",
      "9486",
      "9871",
      "493.55",
      "9871",
      "10364.55",
      "10459.55",
      "43.581458",
    ]);
    expect(result.final).toBe("43.581458");
  });

  it("rejects division by zero", () => {
    expect(() => runCalculator({ operations: [{ op: "divide", a: 1, b: 0 }] })).toThrow("CALCULATOR_DIVIDE_BY_ZERO");
  });
});
