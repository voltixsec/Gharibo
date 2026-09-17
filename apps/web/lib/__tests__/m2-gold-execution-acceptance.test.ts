/**
 * Post-training governance gold tests (DEC-0030).
 *
 * `GHARIBO-exp-001` really executed on Kaggle (kernel version 3, attempt 3,
 * KernelWorkerStatus.COMPLETE). Training completion is NOT model promotion and
 * it is NOT authorization to use the held-out TEST split. These tests freeze
 * exactly that, so a later "green" can never be bought by quietly promoting the
 * adapter, flipping evaluation to a fabricated score, hiding the fp16 → float32
 * runtime deviation, or rewriting the two failed attempts out of history.
 *
 * Everything here is a pure read of the committed governance artifacts — no DB,
 * no network, no GPU, and never the raw TEST payload.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  isAcceptedGoldGovernanceState,
  isKaggleExecutionCompletedGoldState,
  isKaggleLaunchReauthorizedGoldState,
  isKaggleStartAuthorizedGoldState,
} from "@/lib/training/gold-authorization.mjs";
import { sha256Canonical } from "@/lib/training/hash";

const root = path.resolve(__dirname, "../../../..");

const state = JSON.parse(
  fs.readFileSync(path.join(root, "governance/GHARIBO_MASTER_STATE.json"), "utf8"),
);

const acceptance = JSON.parse(
  fs.readFileSync(
    path.join(root, "governance/DEC-0030-kaggle-execution-acceptance.json"),
    "utf8",
  ),
);

const RUN_ID = "ea6e30f2-ce26-4323-b35a-3436ee867eaf";
const PACKAGE_ID =
  "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2";
const ROLLUP =
  "788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885";
const FINAL_ADAPTER =
  "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f";
const CKPT_150 =
  "5e062fa0bbba3c5276e3d6086f8e7dc0a7e1605c2dbf8c1d989ecbfe5a140249";

const completion = state.training.executionCompletion;
const training = completion.training;
const artifacts = completion.artifacts;
const deviation = completion.runtimeDeviation;
const testPolicy = completion.testPolicy;
const evaluation = completion.evaluation;
const promotion = completion.promotion;

/** Structural clone, so a mutation never touches the shared `state` object. */
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("DEC-0030 — completed execution is the operative governance tip", () => {
  it("is the accepted tip while every earlier authorization stays in history", () => {
    // The DEC-0030 acceptance remains a valid, unweakened governance layer, and the
    // composed predicate still accepts the tip. The tip itself has since advanced
    // past this checkpoint (DEC-0048 forensic closure, then DEC-0049 EXP-002
    // preparation), so the point-in-time DEC-0030 predicate is no longer true OF
    // THE TIP — which is exactly what "advanced past it" means, and is asserted
    // explicitly here rather than left implicit.
    expect(isAcceptedGoldGovernanceState(state)).toBe(true);
    expect(isKaggleExecutionCompletedGoldState(state)).toBe(false);

    // The DEC-0030 acceptance facts are still carried verbatim in the state.
    expect(state.training.executionCompletion.runId).toBe(
      "ea6e30f2-ce26-4323-b35a-3436ee867eaf",
    );
    expect(state.training.executionCompletion.trainingCompleted).toBe(true);
    expect(state.training.executionCompletion.experimentId).toBe("GHARIBO-exp-001");

    // The pre-execution checkpoints are no longer operative.
    expect(isKaggleLaunchReauthorizedGoldState(state)).toBe(false);
    expect(isKaggleStartAuthorizedGoldState(state)).toBe(false);

    const byId = (id: string) =>
      (state.decisions as any[]).filter((d) => d.id === id);

    expect(byId("DEC-0030")).toHaveLength(1);
    expect(byId("DEC-0030")[0].status).toBe("ACCEPTED");
    expect(byId("DEC-0030")[0].supersedes).toBeNull();
    expect(byId("DEC-0030")[0].supersededBy).toBeNull();

    // DEC-0027 / DEC-0028 / DEC-0029 were NOT rewritten.
    expect(byId("DEC-0027")[0].status).toBe("SUPERSEDED");
    expect(byId("DEC-0028")[0].status).toBe("SUPERSEDED");
    expect(byId("DEC-0029")[0].status).toBe("ACCEPTED");
    expect(byId("DEC-0029")[0].supersededBy).toBeNull();
  });

  it("no longer claims training has not started, is NOT_STARTED, or is QUEUED", () => {
    expect(state.training.hasStarted).toBe(true);
    expect(state.training.status).toBe("COMPLETED");
    expect(state.currentState.trainingStatus).toBe("COMPLETED");
    expect(state.currentState.trainingHasStarted).toBe(true);
    expect(state.experiments["GHARIBO-exp-001"].runStatus).toBe("COMPLETED");

    const serialized = JSON.stringify(state.training);
    expect(serialized).not.toMatch(/"status"\s*:\s*"NOT_STARTED"/);
    expect(serialized).not.toMatch(/"runStatus"\s*:\s*"QUEUED"/);
    expect(state.training.trainingInvariant ?? "").not.toMatch(/HAS NOT STARTED/);
  });

  it("binds the acceptance to the exact run and package", () => {
    expect(completion.runId).toBe(RUN_ID);
    expect(completion.packageId).toBe(PACKAGE_ID);
    expect(completion.experimentId).toBe("GHARIBO-exp-001");
    expect(completion.kernelRef).toBe(
      "vokaigharibo/gharibo-exp-001-kaggle-start-fec22ca2",
    );
    expect(completion.kernelVersion).toBe(3);
    expect(completion.attemptNumber).toBe(3);
    expect(completion.externalStatus).toBe("KernelWorkerStatus.COMPLETE");
    expect(completion.lifecyclePath).toEqual(["QUEUED", "RUNNING", "COMPLETED"]);
  });

  it("carries a reproducible acceptance hash (the generator is drift-free)", () => {
    const { acceptanceHash, ...body } = acceptance;
    expect(/^[0-9a-f]{64}$/.test(acceptanceHash)).toBe(true);
    expect(sha256Canonical(body)).toBe(acceptanceHash);
    expect(completion.acceptanceHash).toBe(acceptanceHash);
  });
});

describe("DEC-0030 — completion requires real, coherent evidence", () => {
  it("completed the full epoch at the declared step count", () => {
    expect(training.numExamples).toBe(640);
    expect(training.numEpochs).toBe(1);
    expect(training.globalStep).toBe(training.totalSteps);
    expect(training.globalStep).toBe(160);
    expect(training.epoch).toBe(training.numEpochs);
    expect(training.perDeviceTrainBatchSize * training.gradientAccumulationSteps).toBe(
      training.totalBatchSize,
    );
    expect(training.trainableParameters).toBe(3981312);
    expect(training.trainRuntimeSeconds).toBeGreaterThan(0);
    expect(training.trainLoss).toBeGreaterThan(0);
    expect(training.loggedSteps).toBe(160);
    expect(training.completionMarker).toBe("COMPLETED");
  });

  it("rejects a completed state whose completion evidence was tampered with", () => {
    const cases: Array<[string, (s: any) => void]> = [
      ["step count", (s) => { s.training.executionCompletion.training.globalStep = 159; }],
      ["rollup hash", (s) => { s.training.executionCompletion.artifacts.rollupHash = ROLLUP.replace(/^./, "0"); }],
      ["final adapter hash", (s) => { s.training.executionCompletion.artifacts.finalAdapterSha256 = CKPT_150; }],
      ["checksum mismatches", (s) => { s.training.executionCompletion.artifacts.checksumMismatches = 1; }],
      ["external status", (s) => { s.training.executionCompletion.externalStatus = "KernelWorkerStatus.ERROR"; }],
      ["kernel version", (s) => { s.training.executionCompletion.kernelVersion = 2; }],
      ["lifecycle path", (s) => { s.training.executionCompletion.lifecyclePath = ["QUEUED", "COMPLETED"]; }],
      ["training status", (s) => { s.training.status = "RUNNING"; }],
      ["run status", (s) => { s.experiments["GHARIBO-exp-001"].runStatus = "QUEUED"; }],
      ["readiness", (s) => { s.experiments["GHARIBO-exp-001"].readinessStatus = "SOMETHING_ELSE"; }],
      ["decision status", (s) => {
        (s.decisions as any[]).find((d) => d.id === "DEC-0030").status = "SUPERSEDED";
      }],
    ];

    for (const [label, mutate] of cases) {
      const tampered = clone(state);
      mutate(tampered);
      expect(
        isKaggleExecutionCompletedGoldState(tampered),
        `tampering "${label}" must not still be accepted`,
      ).toBe(false);
    }
  });
});

describe("DEC-0030 — the fp16 → float32 deviation is recorded, not hidden", () => {
  it("keeps the authorized recipe and declares the effective dtype separately", () => {
    expect(deviation.declaredDtype).toBe("fp16");
    expect(deviation.effectiveDtype).toBe("float32");
    expect(deviation.operatorAuthored).toBe(false);
    expect(deviation.engineImposed).toBe(true);
    expect(deviation.recipeEditedRetroactively).toBe(false);
    expect(deviation.packageDtypeFieldUnchanged).toBe(true);
    expect(deviation.classification).toBe(
      "MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION",
    );
    expect(deviation.evidence.length).toBeGreaterThan(0);
    expect(deviation.adapterStorageDtype).toBe("F32");
  });

  it("never lets the record claim fp16 was effective", () => {
    const serialized = JSON.stringify(acceptance).toLowerCase();
    expect(serialized).not.toMatch(/"effectivedtype"\s*:\s*"fp16"/);
    expect(serialized).not.toMatch(/fp16.{0,80}(trained|succeeded|was effective)/);
    expect(state.experiments["GHARIBO-exp-001"].declaredDtype).toBe("fp16");
    expect(state.experiments["GHARIBO-exp-001"].effectiveDtype).toBe("float32");
    expect(state.experiments["GHARIBO-exp-001"].runtimeDeviationClassification).toBe(
      "MATERIAL_RUNTIME_DEVIATION_ACCEPTED_POST_EXECUTION",
    );
  });

  it("rejects a state that silently reverts the deviation to fp16", () => {
    const tampered = clone(state);
    tampered.training.executionCompletion.runtimeDeviation.effectiveDtype = "fp16";
    expect(isKaggleExecutionCompletedGoldState(tampered)).toBe(false);

    const retro = clone(state);
    retro.training.executionCompletion.runtimeDeviation.recipeEditedRetroactively = true;
    expect(isKaggleExecutionCompletedGoldState(retro)).toBe(false);
  });

  it("resolves the parameter-count question as accounting, not identity, mismatch", () => {
    const review = completion.parameterCountReview;
    expect(review.verdict).toBe("ACCOUNTING_DIFFERENCE_NOT_MODEL_IDENTITY_MISMATCH");
    expect(review.authoritativeTotalForThisRun).toBe(20918738496);
    expect(review.qualificationArtifactNotEdited).toBe(true);
    expect(review.basis.length).toBeGreaterThan(0);
  });
});

describe("DEC-0030 — TEST stays isolated after training", () => {
  it("was never uploaded, never accessed and never parsed", () => {
    expect(testPolicy.testPayloadUploaded).toBe(false);
    expect(testPolicy.testPayloadAccessed).toBe(false);
    expect(testPolicy.testUsage).toBe("HASH_INTEGRITY_ONLY");
    expect(testPolicy.testRecordsParsed).toBe(0);
    expect(/^[0-9a-f]{64}$/.test(testPolicy.testSplitHash)).toBe(true);
  });

  it("rejects a state that smuggles TEST into training or evaluation", () => {
    const uploaded = clone(state);
    uploaded.training.executionCompletion.testPolicy.testPayloadUploaded = true;
    expect(isKaggleExecutionCompletedGoldState(uploaded)).toBe(false);

    const accessed = clone(state);
    accessed.training.executionCompletion.testPolicy.testPayloadAccessed = true;
    expect(isKaggleExecutionCompletedGoldState(accessed)).toBe(false);
  });
});

describe("DEC-0030 — completion is not promotion and not an evaluation result", () => {
  it("leaves GHARIBO-V0.1 uncreated and evaluation NOT_RUN", () => {
    expect(promotion.promoted).toBe(false);
    expect(promotion.targetModel).toBe("GHARIBO-V0.1");
    expect(promotion.targetStatus).toBe("NOT_CREATED");

    expect(evaluation.status).toBe("NOT_RUN");
    expect(evaluation.executed).toBe(false);
    expect(evaluation.authorizationStatus).toBe(
      "EVALUATION_READY_AWAITING_AUTHORIZATION",
    );
    expect(evaluation.nextGate).toBe("EXPLICIT_EVALUATION_AUTHORIZATION_REQUIRED");

    expect(state.training.evaluationResults).toBe(0);
    // DEC-0048: Evaluation Attempt #6 ran inference over the consumed TEST split
    // and the first scoring pass was non-decisional, so the recorded status moved
    // past NOT_RUN — while still producing NO score and NO promotion. The
    // invariant that matters is unchanged: no evaluation result exists.
    expect(state.experiments["GHARIBO-exp-001"].evaluationStatus).toBe(
      "ATTEMPT_6_INFERENCE_COMPLETE_SCORING_NON_DECISIONAL",
    );
    expect(state.experiments["GHARIBO-exp-001"].evaluationScore).toBeNull();
    expect(state.experiments["GHARIBO-exp-001"].promotable).toBe(false);
  });

  it("keeps every derived model out of a promoted status", () => {
    const models = state.models as any;
    for (const model of models.derivedModels ?? []) {
      expect(model.status).not.toBe("PROMOTED");
    }
    // GHARIBO-V0.1 exists only as a reserved, NOT_CREATED name.
    const v01 = (models.derivedModels ?? []).find(
      (m: any) => m.id === "GHARIBO-V0.1",
    );
    expect(v01).toBeDefined();
    expect(v01.status).toBe("NOT_CREATED");
    expect(JSON.stringify(models)).not.toMatch(/"status"\s*:\s*"(PROMOTED|PRODUCTION)"/);
  });

  it("rejects a state that promotes the model or claims an evaluation", () => {
    const promoted = clone(state);
    promoted.training.executionCompletion.promotion.promoted = true;
    expect(isKaggleExecutionCompletedGoldState(promoted)).toBe(false);

    const evaluated = clone(state);
    evaluated.training.executionCompletion.evaluation.status = "COMPLETED";
    expect(isKaggleExecutionCompletedGoldState(evaluated)).toBe(false);

    const promotable = clone(state);
    promotable.experiments["GHARIBO-exp-001"].promotable = true;
    expect(isKaggleExecutionCompletedGoldState(promotable)).toBe(false);
  });
});

describe("DEC-0030 — the two failed attempts are still history", () => {
  it("preserves attempt 1 and attempt 2 as ERROR before any training", () => {
    const history = completion.executionAttemptHistory;
    expect(history).toHaveLength(3);

    const [first, second, third] = history;
    for (const attempt of [first, second]) {
      expect(attempt.externalStatus).toBe("KernelWorkerStatus.ERROR");
      expect(attempt.trainingStarted).toBe(false);
    }
    expect(first.attemptNumber).toBe(1);
    expect(second.attemptNumber).toBe(2);
    expect(third.attemptNumber).toBe(3);
    expect(third.externalStatus).toBe("KernelWorkerStatus.COMPLETE");
    expect(third.trainingStarted).toBe(true);
  });

  it("rejects a state that drops a failed attempt from history", () => {
    const trimmed = clone(state);
    trimmed.training.executionCompletion.executionAttemptHistory =
      completion.executionAttemptHistory.slice(1);
    expect(isKaggleExecutionCompletedGoldState(trimmed)).toBe(false);
  });
});

describe("DEC-0030 — artifact evidence", () => {
  it("records the real rollup and the three adapter identities", () => {
    expect(artifacts.rollupHash).toBe(ROLLUP);
    expect(artifacts.rollupRecomputedMatches).toBe(true);
    expect(artifacts.checksumMismatches).toBe(0);
    expect(artifacts.finalAdapterSha256).toBe(FINAL_ADAPTER);
    expect(artifacts.checkpoint160Sha256).toBe(FINAL_ADAPTER);
    expect(artifacts.checkpoint150Sha256).toBe(CKPT_150);
    expect(artifacts.checkpointSteps).toEqual([150, 160]);
  });

  it("registers model artifacts only — never the Unsloth compiled cache", () => {
    expect(artifacts.registeredKinds).toEqual([
      "final_adapter",
      "checkpoint_160",
      "checkpoint_150",
      "trainer_state",
      "metrics",
      "manifest",
      "checksums",
    ]);
    expect(artifacts.registeredKinds.join(",")).not.toMatch(/compiled_cache/);
    expect(artifacts.commitPolicy).toMatch(/never committed/i);
  });
});
