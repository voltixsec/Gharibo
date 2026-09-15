import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isAcceptedGoldGovernanceState,
  isKaggleLaunchRepairedGoldState,
  isKaggleStartAuthorizedGoldState,
} from "@/lib/training/gold-authorization.mjs";

const root = path.resolve(__dirname, "../../../..");

const state = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "governance/GHARIBO_MASTER_STATE.json",
    ),
    "utf8",
  ),
);

/**
 * DEC-0027 authorized the first Kaggle launch. That launch was accepted and then
 * failed at KernelWorkerStatus.ERROR, so DEC-0028 repairs the artifact and
 * supersedes DEC-0027 for launch purposes. DEC-0027 keeps every evidence field it
 * recorded and remains the historical record for the artifact it anchored.
 */
describe("DEC-0027 Kaggle start authorization (superseded launch checkpoint)", () => {
  it("is retained as a superseded checkpoint while the repaired authorization is the tip", () => {
    // DEC-0027 is no longer the operative launch authorization.
    expect(isKaggleStartAuthorizedGoldState(state)).toBe(false);

    // The repaired authorization is the current tip, and the chain is still accepted.
    expect(isKaggleLaunchRepairedGoldState(state)).toBe(true);
    expect(isAcceptedGoldGovernanceState(state)).toBe(true);

    const dec0027 = (state.decisions as any[]).filter((d) => d.id === "DEC-0027");
    expect(dec0027).toHaveLength(1);
    expect(dec0027[0].status).toBe("SUPERSEDED");
    expect(dec0027[0].supersededBy).toBe("DEC-0028");

    // The DEC-0027 authorization block itself is untouched historical evidence.
    const start = state.training.kaggleStartAuthorization;
    expect(start.decisionId).toBe("DEC-0027");
    expect(start.startAuthorized).toBe(true);
    expect(start.launchAttempted).toBe(false);
    expect(start.launchBundleHash).toBe(
      "fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0",
    );
    expect(start.notebookSha256).toBe(
      "f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf",
    );

    expect(state.experiments["GHARIBO-exp-001"].runStatus).toBe("QUEUED");
    expect(state.training.hasStarted).toBe(false);
  });

  it("records launch attempt 1 truthfully and does not claim a training start", () => {
    const attempt = state.training.kaggleLaunchAuthorization.launchAttemptHistory[0];
    expect(attempt.attemptNumber).toBe(1);
    expect(attempt.externalStatus).toBe("KernelWorkerStatus.ERROR");
    expect(attempt.rootCauseClass).toBe(
      "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED",
    );
    expect(attempt.trainingStarted).toBe(false);
    expect(attempt.testPayloadUploaded).toBe(false);
    expect(attempt.testPayloadAccessed).toBe(false);
    expect(state.training.kaggleLaunchAuthorization.trainingHasStarted).toBe(false);
  });

  it("keeps the governed recipe, model, dataset, splits and TEST policy unchanged", () => {
    const repaired = state.training.kaggleLaunchAuthorization;
    const original = state.training.kaggleStartAuthorization;
    expect(JSON.stringify(repaired.recipe)).toBe(JSON.stringify(original.recipe));
    expect(repaired.datasetHash).toBe(original.datasetHash);
    expect(JSON.stringify(repaired.splitHashes)).toBe(JSON.stringify(original.splitHashes));
    expect(repaired.recipeHash).toBe(original.recipeHash);
    expect(repaired.testUsage).toBe("HASH_INTEGRITY_ONLY");
    expect(repaired.testPayloadIncluded).toBe(false);
    expect(repaired.testPayloadAccessed).toBe(false);
    for (const key of [
      "recipeChanged",
      "modelChanged",
      "datasetChanged",
      "splitsChanged",
      "testPolicyChanged",
      "dependencySetChanged",
    ]) {
      expect(repaired.repair[key]).toBe(false);
    }
  });

  it("fails closed for mutated launch or TEST state", () => {
    const mutations = [
      (s: any) => {
        s.training.kaggleLaunchAuthorization.launchBundleHash = "0".repeat(64);
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.notebookSha256 = "0".repeat(64);
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.testPayloadIncluded = true;
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.testPayloadAccessed = true;
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.launchAttempted = true;
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.executionStarted = true;
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.repair.recipeChanged = true;
      },
      (s: any) => {
        s.training.kaggleLaunchAuthorization.launchAttemptHistory[0].externalStatus =
          "KernelWorkerStatus.COMPLETE";
      },
      (s: any) => {
        s.experiments["GHARIBO-exp-001"].runStatus = "RUNNING";
      },
      (s: any) => {
        s.training.hasStarted = true;
      },
    ];

    for (const mutate of mutations) {
      const bad = structuredClone(state);
      mutate(bad);

      expect(isKaggleLaunchRepairedGoldState(bad)).toBe(false);
      expect(isAcceptedGoldGovernanceState(bad)).toBe(false);
    }
  });
});
