import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  isAcceptedGoldGovernanceState,
  isKaggleExecutionCompletedGoldState,
  isKaggleLaunchReauthorizedGoldState,
  isKaggleLaunchRepairedGoldState,
  isKaggleStartAuthorizedGoldState,
  preExecutionState,
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

const DEC0027_NOTEBOOK =
  "f849aa41a8c4affbaae9b4e0d5cf049d14c818df3289619eba8b0a1471e33ddf";
const DEC0027_BUNDLE =
  "fec22ca290645035fc807f3cc6dec40c5f26389b18f490e932c4bd05e31cb4c0";
const DEC0028_NOTEBOOK =
  "be4af0d4f9a492e7c6b5a2b713b205e17adf7d34d0d0f62aaf1589977cec54ba";
const DEC0028_BUNDLE =
  "4380da6382a1484ed41388661057c4a9c1c60f7ae34d612380a4b6f36da21230";
const DEC0029_NOTEBOOK =
  "dda3b050034afa0922bda573565ff8f678767e62a944a01d597761aec254b4b1";
const DEC0029_BUNDLE =
  "b3b4efc8f4b4c04eedd8610b6b4cdb479817d638e971ce8e8c9b67079d587efb";

/**
 * DEC-0027 authorized launch attempt 1, which failed at KernelWorkerStatus.ERROR.
 * DEC-0028 repaired the artifact and authorized attempt 2, which failed at
 * KernelWorkerStatus.ERROR for a different, now fully-diagnosed reason: the whole
 * frozen set was submitted to one resolver transaction.
 * DEC-0029 reproduced the accepted qualification's install staging; attempt 3 then
 * actually trained (KernelWorkerStatus.COMPLETE) and DEC-0030 accepted the outcome.
 *
 * DEC-0027/0028/0029 are therefore HISTORY, not the tip. Their own invariants are
 * pinned here against `preExecutionState(state)` — the DEC-0029 checkpoint as it
 * stood before DEC-0030 — so these assertions stay live instead of passing only
 * because the tip no longer matches their shape.
 *
 * Every superseded checkpoint keeps every evidence field it recorded.
 */
describe("superseded Kaggle launch checkpoints (DEC-0027, DEC-0028)", () => {
  // The DEC-0029 checkpoint as it stood before DEC-0030 accepted the completion.
  const preExecution = preExecutionState(state);

  it("is retained as history while the completed execution is the tip", () => {
    // Neither older layer is the operative launch authorization any more.
    expect(isKaggleStartAuthorizedGoldState(state)).toBe(false);
    expect(isKaggleLaunchRepairedGoldState(state)).toBe(false);
    expect(isKaggleLaunchReauthorizedGoldState(state)).toBe(false);

    // The accepted completion is the current tip, and the chain is still accepted.
    expect(isKaggleExecutionCompletedGoldState(state)).toBe(true);
    expect(isAcceptedGoldGovernanceState(state)).toBe(true);

    // ...and the DEC-0029 checkpoint it grew out of still validates on its own terms.
    expect(isKaggleLaunchReauthorizedGoldState(preExecution)).toBe(true);
    expect(isAcceptedGoldGovernanceState(preExecution)).toBe(true);

    const byId = (id: string) => (state.decisions as any[]).filter((d) => d.id === id);

    expect(byId("DEC-0027")).toHaveLength(1);
    expect(byId("DEC-0027")[0].status).toBe("SUPERSEDED");
    expect(byId("DEC-0027")[0].supersededBy).toBe("DEC-0028");

    expect(byId("DEC-0028")).toHaveLength(1);
    expect(byId("DEC-0028")[0].status).toBe("SUPERSEDED");
    expect(byId("DEC-0028")[0].supersededBy).toBe("DEC-0029");

    expect(byId("DEC-0029")).toHaveLength(1);
    expect(byId("DEC-0029")[0].status).toBe("ACCEPTED");
    expect(byId("DEC-0029")[0].supersedes).toBe("DEC-0028");
    expect(byId("DEC-0029")[0].supersededBy).toBeNull();
  });

  it("keeps every superseded authorization block as untouched historical evidence", () => {
    const start = state.training.kaggleStartAuthorization;
    expect(start.decisionId).toBe("DEC-0027");
    expect(start.startAuthorized).toBe(true);
    expect(start.launchAttempted).toBe(false);
    expect(start.launchBundleHash).toBe(DEC0027_BUNDLE);
    expect(start.notebookSha256).toBe(DEC0027_NOTEBOOK);

    const repaired = state.training.kaggleLaunchAuthorization;
    expect(repaired.decisionId).toBe("DEC-0028");
    expect(repaired.launchBundleHash).toBe(DEC0028_BUNDLE);
    expect(repaired.notebookSha256).toBe(DEC0028_NOTEBOOK);
    expect(repaired.supersededLaunchBundleHash).toBe(DEC0027_BUNDLE);
    expect(repaired.supersededNotebookSha256).toBe(DEC0027_NOTEBOOK);

    const reauth = state.training.kaggleLaunchReauthorization;
    expect(reauth.decisionId).toBe("DEC-0029");
    expect(reauth.supersedesDecisionId).toBe("DEC-0028");
    expect(reauth.launchBundleHash).toBe(DEC0029_BUNDLE);
    expect(reauth.notebookSha256).toBe(DEC0029_NOTEBOOK);
    expect(reauth.supersededLaunchBundleHash).toBe(DEC0028_BUNDLE);
    expect(reauth.supersededNotebookSha256).toBe(DEC0028_NOTEBOOK);

    // DEC-0029's own block still records the pre-execution truth it was issued with.
    expect(reauth.trainingHasStarted).toBe(false);

    // The live state has since advanced to the accepted completion (DEC-0030) —
    // advancing it did not rewrite any field of the superseded blocks above.
    expect(state.experiments["GHARIBO-exp-001"].runStatus).toBe("COMPLETED");
    expect(state.training.hasStarted).toBe(true);
  });

  it("records both launch attempts truthfully and never claims a training start", () => {
    const attempts = state.training.kaggleLaunchReauthorization.launchAttemptHistory;
    expect(attempts).toHaveLength(2);

    expect(attempts[0].attemptNumber).toBe(1);
    expect(attempts[0].decisionId).toBe("DEC-0027");
    expect(attempts[0].artifactNotebookSha256).toBe(DEC0027_NOTEBOOK);
    expect(attempts[0].externalStatus).toBe("KernelWorkerStatus.ERROR");
    expect(attempts[0].rootCauseClass).toBe(
      "DEPENDENCY_INSTALL_FAILURE_WITH_DIAGNOSTIC_SUPPRESSED",
    );

    expect(attempts[1].attemptNumber).toBe(2);
    expect(attempts[1].decisionId).toBe("DEC-0028");
    expect(attempts[1].artifactNotebookSha256).toBe(DEC0028_NOTEBOOK);
    expect(attempts[1].artifactLaunchBundleHash).toBe(DEC0028_BUNDLE);
    expect(attempts[1].externalStatus).toBe("KernelWorkerStatus.ERROR");
    expect(attempts[1].rootCauseClass).toBe(
      "FROZEN_SET_RESOLVER_UNSATISFIABLE_IN_SINGLE_TRANSACTION",
    );

    for (const attempt of attempts) {
      expect(attempt.trainingStarted).toBe(false);
      expect(attempt.testPayloadUploaded).toBe(false);
      expect(attempt.testPayloadAccessed).toBe(false);
    }
    expect(state.training.kaggleLaunchReauthorization.trainingHasStarted).toBe(false);
  });

  it("keeps the governed recipe, model, dataset, splits and TEST policy unchanged", () => {
    const reauth = state.training.kaggleLaunchReauthorization;
    const original = state.training.kaggleStartAuthorization;
    expect(JSON.stringify(reauth.recipe)).toBe(JSON.stringify(original.recipe));
    expect(reauth.datasetHash).toBe(original.datasetHash);
    expect(JSON.stringify(reauth.splitHashes)).toBe(JSON.stringify(original.splitHashes));
    expect(reauth.recipeHash).toBe(original.recipeHash);
    expect(reauth.qualificationHash).toBe(original.qualificationHash);
    expect(reauth.engineFreeze).toBe(original.engineFreeze);
    expect(reauth.testUsage).toBe("HASH_INTEGRITY_ONLY");
    expect(reauth.testPayloadIncluded).toBe(false);
    expect(reauth.testPayloadAccessed).toBe(false);
    for (const key of [
      "recipeChanged",
      "modelChanged",
      "datasetChanged",
      "splitsChanged",
      "testPolicyChanged",
      "dependencySetChanged",
    ]) {
      expect(reauth.repair[key]).toBe(false);
    }
  });

  it("records the staged-install repair as a resolution-strategy change only", () => {
    const staged = state.training.kaggleLaunchReauthorization.stagedInstallRepair;
    expect(staged.dependencySetChanged).toBe(false);
    expect(staged.declaredSpecsUnchanged).toBe(true);
    expect(staged.conflictingPair).toEqual(
      expect.arrayContaining(["unsloth==2026.9.4", "unsloth_zoo==2026.9.3"]),
    );
    expect(staged.stages.map((s: any) => s.phase)).toEqual([
      "install",
      "frozen-no-deps",
      "support-no-deps",
    ]);
    // The resolver stage carries the governed datasets pin and never the capped pair.
    expect(staged.stages[0].specs).toContain("datasets==5.0.1");
    expect(staged.stages[0].specs.some((s: string) => s.startsWith("unsloth"))).toBe(false);
    expect(staged.stages[1].flags).toContain("--no-deps");
    expect(staged.stages[1].specs).toEqual(
      expect.arrayContaining(["unsloth==2026.9.4", "unsloth_zoo==2026.9.3"]),
    );
    expect(staged.stages[2].flags).toContain("--no-deps");
    // The precedent is the accepted qualification, and the resolver proof is recorded.
    expect(staged.qualificationPrecedent.activeRuntimeAlignment).toBe("IDENTICAL");
    expect(staged.qualificationPrecedent.installPlan).toHaveLength(3);
    expect(staged.resolverProof.oldSingleTransactionResolved).toBe(false);
    expect(staged.resolverProof.stage1ResolvedVersions.tokenizers).toBe("0.22.2");
    expect(staged.resolverProof.stage1ResolvedVersions["huggingface-hub"]).toBe("0.36.2");
  });

  it("fails closed for mutated launch, staged-install or TEST state", () => {
    const tip = (s: any) => s.training.kaggleLaunchReauthorization;
    const mutations = [
      (s: any) => {
        tip(s).launchBundleHash = "0".repeat(64);
      },
      (s: any) => {
        tip(s).notebookSha256 = "0".repeat(64);
      },
      (s: any) => {
        tip(s).supersededNotebookSha256 = "0".repeat(64);
      },
      (s: any) => {
        tip(s).supersededLaunchBundleHash = "0".repeat(64);
      },
      (s: any) => {
        tip(s).testPayloadIncluded = true;
      },
      (s: any) => {
        tip(s).testPayloadAccessed = true;
      },
      (s: any) => {
        tip(s).launchAttempted = true;
      },
      (s: any) => {
        tip(s).executionStarted = true;
      },
      (s: any) => {
        tip(s).repair.recipeChanged = true;
      },
      (s: any) => {
        tip(s).repair.dependencySetChanged = true;
      },
      // The staged-install record is the core of this checkpoint.
      (s: any) => {
        tip(s).stagedInstallRepair.dependencySetChanged = true;
      },
      (s: any) => {
        tip(s).stagedInstallRepair.declaredSpecsUnchanged = false;
      },
      (s: any) => {
        tip(s).stagedInstallRepair.stages[0].specs.push("unsloth==2026.9.4");
      },
      (s: any) => {
        tip(s).stagedInstallRepair.stages[1].specs = ["unsloth==2026.9.4"];
      },
      (s: any) => {
        tip(s).stagedInstallRepair.stages[1].flags = [];
      },
      (s: any) => {
        tip(s).stagedInstallRepair.conflictingPair = ["datasets==5.0.1"];
      },
      (s: any) => {
        tip(s).stagedInstallRepair.resolverProof.oldSingleTransactionResolved = true;
      },
      (s: any) => {
        tip(s).stagedInstallRepair.qualificationPrecedent.activeRuntimeAlignment = "DIVERGENT";
      },
      (s: any) => {
        tip(s).stagedInstallRepair.preservedDependencies.torch = "2.14.0";
      },
      // Attempt history must stay truthful.
      (s: any) => {
        tip(s).launchAttemptHistory.pop();
      },
      (s: any) => {
        tip(s).launchAttemptHistory[1].artifactNotebookSha256 = "0".repeat(64);
      },
      (s: any) => {
        tip(s).launchAttemptHistory[1].externalStatus = "KernelWorkerStatus.COMPLETE";
      },
      (s: any) => {
        tip(s).launchAttemptHistory[1].rootCauseClass = "UNKNOWN";
      },
      (s: any) => {
        tip(s).launchAttemptHistory[1].trainingStarted = true;
      },
      (s: any) => {
        tip(s).launchAttemptHistory[0].externalStatus = "KernelWorkerStatus.COMPLETE";
      },
      (s: any) => {
        s.experiments["GHARIBO-exp-001"].runStatus = "RUNNING";
      },
      (s: any) => {
        s.training.hasStarted = true;
      },
      // The supersession chain must stay reciprocal.
      (s: any) => {
        s.decisions.find((d: any) => d.id === "DEC-0028").supersededBy = null;
      },
      (s: any) => {
        s.decisions.find((d: any) => d.id === "DEC-0029").status = "DRAFT";
      },
      // The reauthorization hash must be recomputable from the recorded body.
      (s: any) => {
        tip(s).recipeHash = "0".repeat(64);
      },
    ];

    // The mutations are applied to the DEC-0029 checkpoint as it stood before the
    // completion, which is the state this layer's predicate actually governs.
    for (const mutate of mutations) {
      const bad = structuredClone(preExecution);
      mutate(bad);

      expect(isKaggleLaunchReauthorizedGoldState(bad)).toBe(false);
      expect(isAcceptedGoldGovernanceState(bad)).toBe(false);
    }

    // The DEC-0030 tip fails closed on its own bindings too — altering the launch
    // authorization hash it recorded must not stay accepted.
    const badTip = structuredClone(state);
    badTip.training.executionCompletion.launchAuthorizationHash = "0".repeat(64);
    expect(isKaggleExecutionCompletedGoldState(badTip)).toBe(false);
    expect(isAcceptedGoldGovernanceState(badTip)).toBe(false);
  });
});
