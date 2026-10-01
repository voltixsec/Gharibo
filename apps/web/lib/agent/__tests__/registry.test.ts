import { describe, expect, it } from "vitest";
import { routeAgentCapabilities } from "../registry";

describe("routeAgentCapabilities", () => {
  it("routes arithmetic to calculator without dropping GHARIBO", () => {
    expect(routeAgentCapabilities("Calculate landed cost and gross margin").map((capability) => capability.id)).toEqual([
      "gharibo_model",
      "calculator",
      "web_search",
      "web_fetch",
      "evidence_verify",
    ]);
  });

  it("routes debugging to the bounded code solver", () => {
    const ids = routeAgentCapabilities("Debug this TypeScript Promise.all function").map((capability) => capability.id);
    expect(ids).toContain("gharibo_model");
    expect(ids).toContain("code_solver");
  });
});
