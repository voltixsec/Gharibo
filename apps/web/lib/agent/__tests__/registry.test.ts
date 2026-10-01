import { describe, expect, it } from "vitest";
import { routeAgentCapabilities } from "../registry";

describe("routeAgentCapabilities", () => {
  it("routes arithmetic to calculator without dropping GHARIBO", () => {
    expect(routeAgentCapabilities("Calculate landed cost and gross margin").map((capability) => capability.id)).toEqual([
      "gharibo_model",
      "calculator",
    ]);
  });

  it("routes debugging to the bounded code solver", () => {
    const ids = routeAgentCapabilities("Debug this TypeScript Promise.all function").map((capability) => capability.id);
    expect(ids).toContain("gharibo_model");
    expect(ids).toContain("code_solver");
  });

  it("routes product research to web and evidence capabilities", () => {
    const ids = routeAgentCapabilities("Research the latest CCTV product and cite sources").map((capability) => capability.id);
    expect(ids).toEqual([
      "gharibo_model",
      "web_search",
      "web_fetch",
      "evidence_verify",
    ]);
  });
});
