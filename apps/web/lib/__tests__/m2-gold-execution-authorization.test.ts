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

describe("DEC-0026 execution authorization", () => {
  it("accepts only the exact QUEUED checkpoint while training remains NOT_STARTED", () => {
    expect(isIssuedGoldState(state)).toBe(false);
    expect(isExecutionAuthorizedGoldState(state)).toBe(true);
    expect(isAcceptedGoldGovernanceState(state)).toBe(true);

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
