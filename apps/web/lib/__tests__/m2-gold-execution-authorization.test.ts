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

    // DEC-0026's own block is preserved verbatim: it authorized a QUEUED run and
    // recorded that execution had not started.
    expect(state.training.executionAuthorization.executionAuthorized).toBe(true);
    expect(state.training.executionAuthorization.kaggleStartAuthorized).toBe(false);
    expect(state.training.executionAuthorization.executionStarted).toBe(false);
    expect(state.training.executionAuthorization.status).toBe(
      "EXECUTION_AUTHORIZED_QUEUED",
    );

    // The run it authorized has since executed and completed (DEC-0030), which is
    // why this layer is history rather than the tip.
    expect(state.experiments["GHARIBO-exp-001"].runStatus).toBe("COMPLETED");
    expect(state.training.hasStarted).toBe(true);
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

    // The tip is now DEC-0030, so the accepted-chain predicate no longer keys off
    // this layer's fields. What must still hold is that THIS layer fails closed.
    for (const mutate of mutations) {
      const bad = structuredClone(state);
      mutate(bad);
      expect(isExecutionAuthorizedGoldState(bad)).toBe(false);
    }

    // The DEC-0030 tip fails closed on its own bindings: altering the DEC-0026
    // authorization hash it carries must not stay accepted.
    const badTip = structuredClone(state);
    badTip.training.executionCompletion.executionAuthorizationHash = "0".repeat(64);
    expect(isExecutionAuthorizedGoldState(badTip)).toBe(false);
    expect(isAcceptedGoldGovernanceState(badTip)).toBe(false);
  });
});
