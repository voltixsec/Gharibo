import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isAcceptedGoldGovernanceState,
  isExecutionAuthorizedGoldState,
  isIssuedGoldState,
} from "@/lib/training/gold-authorization.mjs";

const root = path.resolve(__dirname, "../../../..");
const state = JSON.parse(
  fs.readFileSync(
    path.join(root, "governance/GHARIBO_MASTER_STATE.json"),
    "utf8",
  ),
);

/**
 * DEC-0026 authorized the QUEUED transition. It is an ACCEPTED checkpoint in the
 * governance chain; later checkpoints (DEC-0027, DEC-0028) build on it, so it is no
 * longer the tip. These assertions are deliberately tip-agnostic: they pin the
 * DEC-0026 layer's own invariants and require the current tip to remain accepted,
 * whatever the tip happens to be.
 */
describe("DEC-0026 execution authorization (accepted chain checkpoint)", () => {
  it("keeps its own invariants while later checkpoints remain the tip", () => {
    // DEC-0026 is neither the tip nor the DEC-0025 issuance layer any more.
    expect(isIssuedGoldState(state)).toBe(false);
    expect(isExecutionAuthorizedGoldState(state)).toBe(false);
    // ...but the chain as a whole is still an accepted governance state.
    expect(isAcceptedGoldGovernanceState(state)).toBe(true);

    const dec0026 = (state.decisions as any[]).filter((d) => d.id === "DEC-0026");
    expect(dec0026).toHaveLength(1);
    expect(["ACCEPTED", "SUPERSEDED"]).toContain(dec0026[0].status);

    expect(state.experiments["GHARIBO-exp-001"].runStatus).toBe("QUEUED");
    expect(state.training.executionAuthorization.executionAuthorized).toBe(true);
    expect(state.training.executionAuthorization.kaggleStartAuthorized).toBe(false);
    expect(state.training.executionAuthorization.executionStarted).toBe(false);
    expect(state.training.hasStarted).toBe(false);
  });

  it("fails closed for altered identity, TEST policy, RUNNING or start authorization", () => {
    const mutations = [
      (s: any) => { s.training.executionAuthorization.packageId = "0".repeat(64); },
      (s: any) => { s.training.executionAuthorization.runId = "00000000-0000-0000-0000-000000000000"; },
      (s: any) => { s.training.executionAuthorization.issuanceReceiptHash = "0".repeat(64); },
      (s: any) => { s.training.executionAuthorization.testUsage = "TUNING"; },
      (s: any) => { s.training.executionAuthorization.kaggleStartAuthorized = true; },
      (s: any) => { s.training.executionAuthorization.executionStarted = true; },
      (s: any) => { s.experiments["GHARIBO-exp-001"].runStatus = "RUNNING"; },
      (s: any) => { s.training.hasStarted = true; },
    ];

    for (const mutate of mutations) {
      const bad = structuredClone(state);
      mutate(bad);
      expect(isExecutionAuthorizedGoldState(bad)).toBe(false);
      expect(isAcceptedGoldGovernanceState(bad)).toBe(false);
    }
  });
});
