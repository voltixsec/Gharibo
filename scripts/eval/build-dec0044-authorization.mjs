#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0044-evaluation-attempt-5-authorization.json";

const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;

const sha256Canonical = (value) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

export function authorizationBody() {
  return {
    status: "EVALUATION_ATTEMPT_5_AUTHORIZED_WITH_LIMITS",
    decisionId: "DEC-0044",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0040",
    recordKind: "ATTEMPT_5_AUTHORIZATION_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T09:56:06.311Z",
    recordDate: "2026-09-16",
    recorderRole: "CEO",
    authority:
      "Explicit CEO instruction in the current conversation: approved Evaluation Attempt #5.",

    decision: "AUTHORIZED WITH LIMITS",

    decisionScope:
      "EXACTLY ONE governed held-out TEST benchmark execution (attempt #5): BASE first, then CANDIDATE, over the SAME 80 held-out TEST prompts under the frozen evaluation contract.",

    attemptNumber: 5,
    maximumKernelPushes: 1,
    automaticRetryAuthorized: false,

    arms: ["base", "candidate"],
    armOrder: "BASE_THEN_CANDIDATE",
    baseArmRequiredFirst: true,
    sameTestRecordsForBothArms: true,

    testRecordCount: 80,
    testSplitHash:
      "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",

    harnessVersion: "gharibo-eval-harness-1.0.0",

    metricIds: [
      "M1", "M2", "M3", "M4", "M5", "M6", "M7",
      "M8", "M9", "M10", "M11", "M12", "M13"
    ],

    requiredLoaderArchitecture:
      "IMMUTABLE_LOCAL_SNAPSHOT",

    requiredLoaderArchitectureProvenBy:
      "DEC-0043",

    distributionRepo:
      "unsloth/gpt-oss-20b-unsloth-bnb-4bit",

    immutableDistributionRevision:
      "093fba6992ef5a7152481afec0bdfca1ac486998",

    loaderRequirement:
      "snapshot_download(exact distribution repo, exact immutable SHA) -> capture local SNAPSHOT_DIR -> seal remote resolution -> FastLanguageModel.from_pretrained(model_name=SNAPSHOT_DIR, local_files_only=True).",

    mutableMainResolutionPermitted: false,

    baseModel:
      "openai/gpt-oss-20b",

    baseModelRevision:
      "6cee5e81ee83917806bbde320786a8fb61efebee",

    candidateArmId:
      "GHARIBO-exp-001",

    candidateAdapterSha256:
      "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",

    datasetHash:
      "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",

    payloadBasis: "PROMPTS_ONLY",
    datasetVisibility: "PRIVATE",
    goldPayloadIncluded: false,

    decoding: {
      temperature: 0.0,
      doSample: false,
      topP: 1.0,
      topK: 0,
      maxNewTokens: 1024,
      seed: 0,
      repeats: 1,
      maxSeqLength: 1024,
      reasoningEffort: "medium"
    },

    decodingIdenticalAcrossArms: true,
    candidateSettingsMayChangeAfterBaseOutput: false,

    testAccessAuthorized: true,
    inferenceAuthorized: true,
    scoringAuthorized: true,

    retrainingAuthorized: false,
    checkpointSelectionAuthorized: false,
    promptTuningAuthorized: false,
    fewShotTuningAuthorized: false,
    thresholdTuningAuthorized: false,
    datasetMutationAuthorized: false,
    testDrivenCodeOptimisationAuthorized: false,
    modelSelectionAuthorized: false,

    promotionAuthorized: false,
    ghariboV01CreationAuthorized: false,

    authorizationSpentOnInferenceStart: true,

    authorizationSpentRule:
      "Once held-out TEST inference materially begins, this authorization is spent. Poor BASE or CANDIDATE results never authorize a rerun or settings change.",

    onPreInferenceFailure:
      "Record the exact failure and STOP. No repair-and-retry and no attempt #6 without a new explicit human decision.",

    onPreInferenceFailureRepairAuthorized: false,
    onPreInferenceFailureFurtherAttemptRequiresNewDecision: true,

    priorEvaluationAuthorizationDecisionId: "DEC-0038",
    priorEvaluationAttemptOutcomeDecisionId: "DEC-0040",

    preflightReconciliationDecisionId: "DEC-0043",
    preflightTechnicalResult: "PASS",
    localSnapshotLoaderExecutionProven: true,

    preflightGovernanceCompliance: "NON_COMPLIANT",
    preflightDeviation:
      "TWO_PUSHES_UNDER_ONE_PUSH_AUTHORIZATION",

    preflightDeviationRetroactivelyAuthorized: false,

    preflightTestAccessed: false,
    preflightInferenceExecuted: false,

    evaluationStatusAtAuthorization: "NOT_RUN",
    evaluationResultsAtAuthorization: 0,
    metricValuesProducedAtAuthorization: 0,
    metricValuesRemainNullAtAuthorization: true,

    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",

    baselineCommit:
      "df8ab6b4032617b2858749e200a1271dc9af5bbe",

    note:
      "CEO explicitly authorized one Evaluation Attempt #5 after the immutable local-snapshot loader was execution-proven and the preflight push-count deviation was separately reconciled in DEC-0043. This decision authorizes measurement only. It does not authorize retraining, tuning, model selection, promotion, GHARIBO-V0.1 creation, automatic retry, or any second evaluation push.",

    references: [
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "governance/DEC-0040-evaluation-attempt-4-failure.json",
      "governance/DEC-0043-preflight-reconciliation.json",
      "governance/GHARIBO_MASTER_STATE.json",
      "docs/RESEARCH_BENCHMARK.md",
      "scripts/eval/build-eval-kernel.mjs"
    ]
  };
}

export function authorizationRecord() {
  const body = authorizationBody();
  return {
    ...body,
    authorizationHash: sha256Canonical(body)
  };
}

export function render() {
  return JSON.stringify(authorizationRecord(), null, 2) + "\n";
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`DEC-0044 missing: ${OUT_REL}`);
      process.exit(1);
    }

    if (readFileSync(out, "utf8") !== text) {
      console.error(`DEC-0044 stale: ${OUT_REL}`);
      process.exit(1);
    }

    console.log(
      `DEC-0044 PASS — authorizationHash ${authorizationRecord().authorizationHash}`
    );
    return;
  }

  writeFileSync(out, text, "utf8");

  console.log(`wrote ${OUT_REL}`);
  console.log("Attempt #5 : AUTHORIZED WITH LIMITS");
  console.log("Kernel pushes: 1");
  console.log("Automatic retry: NO");
  console.log("Promotion: NO");
  console.log(`authorizationHash: ${authorizationRecord().authorizationHash}`);
}

main();