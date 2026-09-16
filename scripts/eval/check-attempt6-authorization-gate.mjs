#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
} from "node:fs";

import { createHash } from "node:crypto";

import {
  isEvaluationAttempt6AuthorizedGoldState,
} from "../../apps/web/lib/training/gold-authorization.mjs";

const AUTH =
  "governance/DEC-0046-evaluation-attempt-6-authorization.json";

const MASTER =
  "governance/GHARIBO_MASTER_STATE.json";

const NOTEBOOK =
  "scripts/eval/kaggle/gharibo-eval-002.ipynb";

const PLAN =
  "apps/web/data/kaggle-eval/gharibo-eval-002/launch-plan.json";

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
        .map(
          (key) => [key, canonical(value[key])]
        ),
    );
  }

  return value;
}

function sha256File(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

for (const path of [
  AUTH,
  MASTER,
  NOTEBOOK,
  PLAN,
]) {
  check(`${path} exists`, existsSync(path));
}

if (
  !existsSync(AUTH) ||
  !existsSync(MASTER) ||
  !existsSync(NOTEBOOK) ||
  !existsSync(PLAN)
) {
  process.exit(1);
}

const auth =
  JSON.parse(readFileSync(AUTH, "utf8"));

const state =
  JSON.parse(readFileSync(MASTER, "utf8"));

const plan =
  JSON.parse(readFileSync(PLAN, "utf8"));

const {
  authorizationHash,
  ...body
} = auth;

const computed =
  createHash("sha256")
    .update(
      JSON.stringify(canonical(body))
    )
    .digest("hex");

check(
  "DEC-0046 authorization hash is valid",
  computed === authorizationHash &&
  authorizationHash ===
    "3afac20d638e033c13d875381b97005891d3946f3ba2ac336b04093b287bca93",
);

check(
  "Attempt #6 is exactly one push",
  auth.attemptNumber === 6 &&
  auth.maximumKernelPushes === 1 &&
  auth.automaticRetryAuthorized === false,
);

check(
  "bound notebook bytes are exact",
  sha256File(NOTEBOOK) ===
    "eebd832d771467b8e468b8dbba946b7b7ff3e202f31ae52b6d76c2f1a7b0f48e",
);

check(
  "launch bundle identity is exact",
  plan.launchBundleHash ===
    "598ec55dff3bbffb33beb9e6c1672ca1797abb80a74cc5f34e7300b592853275",
);

check(
  "prompts identity is exact",
  plan.promptsSha256 ===
    "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333",
);

check(
  "plan is prepared but not launched",
  plan.status === "PREPARED_NOT_LAUNCHED" &&
  plan.authorizationDecisionId === "DEC-0046" &&
  plan.attemptNumber === 6 &&
  plan.maximumKernelPushes === 1 &&
  plan.launchAttempted === false &&
  plan.testInferenceOccurred === false &&
  plan.metricValuesProduced === 0,
);

check(
  "gold payload remains excluded",
  plan.goldPayloadIncluded === false &&
  plan.testPayloadIncluded === false,
);

check(
  "master state version is 1.25.0",
  state.masterStateVersion === "1.25.0",
);

check(
  "gold governance predicate accepts Attempt #6 authorization",
  isEvaluationAttempt6AuthorizedGoldState(state),
);

check(
  "no evaluation result exists",
  state.training?.evaluationResults === 0 &&
  state.experiments?.["GHARIBO-exp-001"]?.evaluationStatus ===
    "NOT_RUN",
);

check(
  "candidate remains unpromoted",
  state.experiments?.["GHARIBO-exp-001"]?.promotable ===
    false,
);

const v01 =
  (state.models?.derivedModels || [])
    .find(
      (m) => m?.id === "GHARIBO-V0.1"
    );

check(
  "GHARIBO-V0.1 remains NOT_CREATED",
  v01?.status === "NOT_CREATED",
);

if (failures.length) {
  console.error("");
  console.error(
    `ATTEMPT #6 AUTHORIZATION GATE: FAILED (${failures.length})`
  );

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}

console.log("");
console.log(
  "ATTEMPT #6 AUTHORIZATION GATE: PASSED"
);
console.log(
  "KAGGLE PUSHES AUTHORIZED: 1"
);
console.log(
  "KAGGLE PUSHES PERFORMED: 0"
);
console.log(
  "TEST INFERENCE EXECUTED: NO"
);
console.log(
  "PROMOTION AUTHORIZED: NO"
);