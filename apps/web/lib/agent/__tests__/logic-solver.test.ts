import { describe, expect, it } from "vitest";
import { solveLogic } from "../logic-solver";

describe("solveLogic", () => {
  it("solves the warehouse benchmark exactly", () => {
    const result = solveLogic({
      items: ["A", "B", "C", "D"],
      rules: [
        { type: "before", a: "A", b: "C" },
        { type: "after", a: "B", b: "D" },
        { type: "not_position", item: "C", position: 1 },
        { type: "not_position", item: "D", position: 4 },
        { type: "between_count", a: "A", b: "B", count: 1 },
        { type: "not_position", item: "B", position: 2 },
      ],
    });

    expect(result.validOrders).toEqual([
      ["A", "D", "B", "C"],
      ["D", "A", "C", "B"],
    ]);
    expect(result.count).toBe(2);
    expect(result.checkedPermutations).toBe(24);
    expect(result.truncated).toBe(false);
  });

  it("rejects unknown item references", () => {
    expect(() => solveLogic({
      items: ["A", "B"],
      rules: [{ type: "before", a: "A", b: "C" }],
    })).toThrow("LOGIC_SOLVER_UNKNOWN_ITEM");
  });

  it("bounds the problem size", () => {
    expect(() => solveLogic({
      items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
      rules: [{ type: "before", a: "A", b: "B" }],
    })).toThrow("LOGIC_SOLVER_ITEMS_RANGE");
  });
});
