#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);

const OUT_REL =
  "governance/DEC-0046-evaluation-attempt-6-authorization.json";

const NOTEBOOK_REL =
  "scripts/eval/kaggle/gharibo-eval-002.ipynb";

const EXPECTED_NOTEBOOK_SHA256 =
  "eebd832d771467b8e468b8dbba946b7b7ff3e202f31ae52b6d76c2f1a7b0f48e";

const EXPECTED_LAUNCH_BUNDLE_HASH =
  "598ec55dff3bbffb33beb9e6c1672ca1797abb80a74cc5f34e7300b592853275";

const EXPECTED_PROMPTS_SHA256 =
  "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333";

const CHECK = process.argv.includes("--check");

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

function sha256File(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

function requireThat(ok, message) {
  if (!ok) {
    throw new Error(`DEC-0046: ${message}`);
  }
}

function verifyBoundArtifact() {
  const notebook =
    resolve(ROOT, NOTEBOOK_REL);

  requireThat(
    existsSync(notebook),
    `missing ${NOTEBOOK_REL}`,
  );

  requireThat(
    sha256File(notebook) === EXPECTED_NOTEBOOK_SHA256,
    "Attempt #6 notebook SHA256 drift",
  );
}

export function authorizationBody() {
  return {
    status:
      "EVALUATION_ATTEMPT_6_AUTHORIZED_WITH_LIMITS",

    decisionId: "DEC-0046",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0045",

    recordKind:
      "ATTEMPT_6_AUTHORIZATION_NOT_AN_EVALUATION_RESULT",

    recordRevision: 1,

    recordedAt:
      "2026-09-16T12:47:00.000Z",

    recordDate:
      "2026-09-16",

    recorderRole:
      "CEO",

    authority:
      "Explicit CEO approval in the current conversation for Evaluation Attempt #6 under the stated one-push, no-retry limits.",

    decision:
      "AUTHORIZED WITH LIMITS",

    decisionScope:
      "EXACTLY ONE governed Evaluation Attempt #6: one Kaggle kernel push maximum, BASE first then CANDIDATE, over the SAME 80 held-out TEST prompts with the frozen evaluation and decoding contract.",

    attemptNumber: 6,
    maximumKernelPushes: 1,
    automaticRetryAuthorized: false,

    kernelPushesPerformedAtAuthorization: 0,
    kernelPushesRemainingAtAuthorization: 1,

    launchAttemptedAtAuthorization: false,

    arms: [
      "base",
      "candidate",
    ],

    armOrder:
      "BASE_THEN_CANDIDATE",

    baseArmRequiredFirst: true,
    sameTestRecordsForBothArms: true,

    testRecordCount: 80,

    testSplitHash:
      "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",

    datasetHash:
      "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",

    harnessVersion:
      "gharibo-eval-harness-1.0.0",

    metricIds: [
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
      "M7",
      "M8",
      "M9",
      "M10",
      "M11",
      "M12",
      "M13",
    ],

    requiredLoaderArchitecture:
      "IMMUTABLE_LOCAL_SNAPSHOT_WITH_POST_INSTALL_HFHUB_REFRESH",

    immutableDistributionRepo:
      "unsloth/gpt-oss-20b-unsloth-bnb-4bit",

    immutableDistributionRevision:
      "093fba6992ef5a7152481afec0bdfca1ac486998",

    mutableMainResolutionPermitted: false,

    repairMechanism:
      "After the governed package installation, purge only loaded huggingface_hub modules from sys.modules, invalidate import caches, re-import one coherent installed huggingface_hub version, verify module version equals installed distribution version, then import and execute snapshot_download.",

    repairSourceCommit:
      "05d923f4ed3cada9093263839ba4f3c25717614b",

    repairRegressionChecksPassed: 9,
    staticKernelChecksPassed: 64,

    repairLocallyProven: true,
    repairRuntimeProvenOnKaggleAtAuthorization: false,

    localSnapshotLoaderExecutionPreviouslyProvenBy:
      "DEC-0043",

    priorAttemptFailureDecisionId:
      "DEC-0045",

    priorEvaluationAuthorizationDecisionId:
      "DEC-0044",

    baseModel:
      "openai/gpt-oss-20b",

    baseModelRevision:
      "6cee5e81ee83917806bbde320786a8fb61efebee",

    candidateArmId:
      "GHARIBO-exp-001",

    candidateAdapterSha256:
      "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",

    notebookSha256:
      EXPECTED_NOTEBOOK_SHA256,

    launchBundleHash:
      EXPECTED_LAUNCH_BUNDLE_HASH,

    promptsSha256:
      EXPECTED_PROMPTS_SHA256,

    kernelId:
      "vokaigharibo/gharibo-eval-002-fec22ca2",

    datasetId:
      "vokaigharibo/gharibo-eval-prompts-fec22ca2",

    payloadBasis:
      "PROMPTS_ONLY",

    datasetVisibility:
      "PRIVATE",

    goldPayloadIncluded: false,
    trainPayloadIncluded: false,
    validationPayloadIncluded: false,

    decoding: {
      temperature: 0.0,
      doSample: false,
      topP: 1.0,
      topK: 0,
      maxNewTokens: 1024,
      seed: 0,
      repeats: 1,
      maxSeqLength: 1024,
      reasoningEffort: "medium",
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

    authorizationSpentAtAuthorization: false,
    authorizationConsumedAtAuthorization: false,

    authorizationSpentRule:
      "Once held-out TEST inference materially begins, this authorization is spent. A poor BASE or CANDIDATE result never permits rerun, settings changes, tuning, selection, or TEST-driven optimisation.",

    onPreInferenceFailure:
      "Record the exact failure and STOP. No automatic repair-and-retry. Evaluation Attempt #7 requires a new explicit human decision.",

    onPreInferenceFailureRepairAndRetryAuthorized: false,
    furtherAttemptRequiresNewHumanDecision: true,

    testInferenceOccurredAtAuthorization: false,
    metricValuesProducedAtAuthorization: 0,
    evaluationResultsAtAuthorization: 0,
    evaluationStatusAtAuthorization: "NOT_RUN",

    trainingStatusUnchanged:
      "COMPLETED",

    candidateStatusUnchanged:
      "EXPERIMENTAL_UNPROMOTED",

    ghariboV01StatusUnchanged:
      "NOT_CREATED",

    historicalAttempt5NotebookSha256:
      "49673f97d137445cf9c3ada162d0d70fdf511ff0b308c86681554b472c3e3eb3",

    historicalAttempt5LaunchBundleHash:
      "6b27b342d9615ccf6a56ee9303a8e98ce90638de5290dc9301bd93b6ae9db344",

    historicalAttempt5ImmutableVerified: true,

    baselineCommit:
      "4a28c4b92b223e630416ec15e3f79b7f9694bb22",

    preparedBranch:
      "prep/attempt6-hfhub-refresh",

    note:
      "The CEO explicitly authorized one Evaluation Attempt #6 after the Attempt #5 pre-inference failure was formally closed in DEC-0045 and the Hugging Face Hub post-install refresh repair passed local regression and kernel safety gates. This authorization is measurement-only. It grants exactly one Kaggle push and no automatic retry, training, tuning, model selection, promotion, or GHARIBO-V0.1 creation.",

    references: [
      "governance/DEC-0045-evaluation-attempt-5-failure.json",
      "governance/DEC-0044-evaluation-attempt-5-authorization.json",
      "governance/DEC-0043-preflight-reconciliation.json",
      "scripts/eval/build-eval-kernel-attempt6.mjs",
      "scripts/eval/check-eval-kernel-attempt6.mjs",
      "scripts/eval/check-hfhub-refresh-barrier-attempt6.mjs",
      "scripts/eval/kaggle/gharibo-eval-002.ipynb",
      "scripts/eval/prepare-eval-launch-attempt6.mjs",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/GHARIBO_MASTER_STATE.json",
    ],
  };
}

export function authorizationRecord() {
  verifyBoundArtifact();

  const body =
    authorizationBody();

  return {
    ...body,
    authorizationHash:
      sha256Canonical(body),
  };
}

export function render() {
  return (
    JSON.stringify(
      authorizationRecord(),
      null,
      2,
    ) + "\n"
  );
}

function main() {
  const out =
    resolve(ROOT, OUT_REL);

  const text =
    render();

  if (CHECK) {
    if (!existsSync(out)) {
      console.error(
        `DEC-0046 missing: ${OUT_REL}`,
      );
      process.exit(1);
    }

    if (
      readFileSync(out, "utf8") !== text
    ) {
      console.error(
        `DEC-0046 stale: ${OUT_REL}`,
      );
      process.exit(1);
    }

    console.log(
      `DEC-0046 PASS — authorizationHash ${authorizationRecord().authorizationHash}`,
    );

    return;
  }

  writeFileSync(
    out,
    text,
    "utf8",
  );

  console.log(
    `wrote ${OUT_REL}`,
  );

  console.log(
    "Attempt #6 : AUTHORIZED WITH LIMITS",
  );

  console.log(
    "Kernel pushes: 1",
  );

  console.log(
    "Automatic retry: NO",
  );

  console.log(
    "Promotion: NO",
  );

  console.log(
    `authorizationHash: ${authorizationRecord().authorizationHash}`,
  );
}

main();