#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
} from "node:fs";

import { createHash } from "node:crypto";

const RECORD =
  "governance/DEC-0045-evaluation-attempt-5-failure.json";

const MASTER =
  "governance/GHARIBO_MASTER_STATE.json";

const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures.push(
      `${label}${detail ? ` — ${detail}` : ""}`
    );

    console.error(
      `FAIL  ${label}${detail ? ` — ${detail}` : ""}`
    );
  }
}

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  }

  return value;
}

check(
  "DEC-0045 failure record exists",
  existsSync(RECORD)
);

check(
  "master state exists",
  existsSync(MASTER)
);

if (!existsSync(RECORD) || !existsSync(MASTER)) {
  process.exit(1);
}

const record =
  JSON.parse(readFileSync(RECORD, "utf8"));

const state =
  JSON.parse(readFileSync(MASTER, "utf8"));

const attempt5 =
  state.training?.attempt5Authorization;

const failure =
  state.training?.attempt5Failure;

const experiment =
  state.experiments?.["GHARIBO-exp-001"];

const {
  failureHash,
  ...body
} = record;

const computed =
  createHash("sha256")
    .update(JSON.stringify(canonical(body)))
    .digest("hex");

check(
  "failure record hash is valid",
  failureHash === computed
);

check(
  "DEC-0045 records Attempt #5",
  record.decisionId === "DEC-0045" &&
  record.attemptNumber === 5
);

check(
  "kernel Version 4 ended ERROR",
  record.kernelVersion === 4 &&
  record.kernelStatus ===
    "KernelWorkerStatus.ERROR"
);

check(
  "failure is PRE-INFERENCE",
  record.launchOutcome ===
    "FAILED_PRE_INFERENCE" &&
  record.testInferenceOccurred === false
);

check(
  "failure occurred at snapshot_download before model load",
  record.failurePhase ===
    "SNAPSHOT_DOWNLOAD" &&
  record.failureReachedSnapshotDownload === true &&
  record.failureSnapshotDownloadCompleted === false &&
  record.failureReachedModelLoad === false &&
  record.failureModelObjectConstructed === false
);

check(
  "exact fatal AttributeError is preserved",
  record.failureException === "AttributeError" &&
  record.failureMessage.includes(
    "HF_HUB_ENABLE_HF_TRANSFER"
  )
);

check(
  "prompt payload was present and gold payload absent",
  record.failurePromptPayloadsFound === 1 &&
  record.failureGoldPayloadsFound === 0 &&
  record.failurePromptRecordsLoaded === 80
);

check(
  "Attempt #5 one-push bound is exhausted",
  record.maximumKernelPushes === 1 &&
  record.kernelPushesPerformed === 1 &&
  record.kernelPushesRemaining === 0
);

check(
  "strict inference-spent flag remains false because inference never began",
  record.authorizationSpent === false &&
  record.testInferenceOccurred === false
);

check(
  "one-push execution authorization is consumed",
  record.authorizationConsumed === true &&
  record.authorizationState ===
    "EXHAUSTED_ONE_PUSH_CONSUMED_ZERO_REMAINING"
);

check(
  "no retry or Attempt #6 is authorized",
  record.retryAuthorized === false &&
  record.automaticRetryAuthorized === false &&
  record.attempt6Authorized === false &&
  record.furtherAttemptAuthorized === false &&
  record.furtherAttemptRequiresNewHumanDecision === true
);

check(
  "repair remains separate and unproven on Kaggle",
  record.repairCandidate?.commit ===
    "05d923f4ed3cada9093263839ba4f3c25717614b" &&
  record.repairCandidate?.status ===
    "LOCAL_REGRESSION_PROVEN_ONLY" &&
  record.repairCandidate?.mergedToMain === false &&
  record.repairCandidate?.runtimeProvenOnKaggle === false &&
  record.repairCandidate?.executionAuthorized === false
);

check(
  "master records DEC-0045 failure",
  failure?.decisionId === "DEC-0045" &&
  failure?.failureHash === failureHash
);

check(
  "master records consumed Attempt #5 push",
  attempt5?.status ===
    "FAILED_PRE_INFERENCE_ONE_PUSH_CONSUMED" &&
  attempt5?.kernelPushesPerformed === 1 &&
  attempt5?.kernelPushesRemaining === 0 &&
  attempt5?.kernelVersion === 4 &&
  attempt5?.kernelStatus ===
    "KernelWorkerStatus.ERROR"
);

check(
  "master records no inference and no metrics",
  attempt5?.testInferenceOccurred === false &&
  attempt5?.metricValuesProduced === 0 &&
  state.training?.evaluationResults === 0 &&
  experiment?.evaluationStatus === "NOT_RUN" &&
  experiment?.evaluationScore === null
);

check(
  "candidate remains unpromoted",
  experiment?.promotable === false
);

const v01 =
  (state.models?.derivedModels || [])
    .find((m) => m?.id === "GHARIBO-V0.1");

check(
  "GHARIBO-V0.1 remains NOT_CREATED",
  v01?.status === "NOT_CREATED"
);

check(
  "current state requires a new human decision",
  attempt5?.attempt6Authorized === false &&
  attempt5?.furtherAttemptRequiresNewHumanDecision === true
);

if (failures.length) {
  console.error("");
  console.error(
    `ATTEMPT #5 FAILURE GATE: FAILED (${failures.length})`
  );

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}

console.log("");
console.log("ATTEMPT #5 FAILURE GATE: PASSED");
console.log("ATTEMPT #6 AUTHORIZED: NO");
console.log("KAGGLE PUSH EXECUTED BY THIS GATE: NO");