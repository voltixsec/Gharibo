#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { EVAL_PINS } from "./build-eval-kernel.mjs";

const AUTH =
  "governance/DEC-0044-evaluation-attempt-5-authorization.json";

const PLAN =
  "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json";

const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

check("DEC-0044 authorization exists", existsSync(AUTH));

if (!existsSync(AUTH)) {
  process.exit(1);
}

const auth = JSON.parse(readFileSync(AUTH, "utf8"));

check(
  "authorization decision is DEC-0044",
  auth.decisionId === "DEC-0044"
);

check(
  "authorization status permits attempt #5",
  auth.status === "EVALUATION_ATTEMPT_5_AUTHORIZED_WITH_LIMITS"
);

check(
  "authorization attempt number is 5",
  auth.attemptNumber === 5
);

check(
  "authorization permits exactly ONE push",
  auth.maximumKernelPushes === 1
);

check(
  "automatic retry remains forbidden",
  auth.automaticRetryAuthorized === false
);

check(
  "local immutable snapshot loader was execution-proven",
  auth.localSnapshotLoaderExecutionProven === true
);

check(
  "promotion remains forbidden",
  auth.promotionAuthorized === false &&
  auth.ghariboV01CreationAuthorized === false
);

check(
  "kernel pin uses DEC-0044",
  EVAL_PINS.authorizationDecisionId === "DEC-0044"
);

check(
  "kernel pin identifies attempt #5",
  EVAL_PINS.attemptNumber === 5
);

check(
  "kernel pin permits exactly ONE push",
  EVAL_PINS.maximumKernelPushes === 1
);

check(
  "kernel carries DEC-0038 as prior evaluation authorization",
  EVAL_PINS.priorAuthorizationDecisionId === "DEC-0038"
);

check(
  "TEST count remains exactly 80",
  EVAL_PINS.testRecordCount === 80
);

check(
  "TEST hash unchanged",
  EVAL_PINS.testSplitHash ===
    "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b"
);

check(
  "candidate adapter identity unchanged",
  EVAL_PINS.candidateAdapterSha256 ===
    "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f"
);

check(
  "immutable distribution unchanged",
  EVAL_PINS.distributionRepo ===
    "unsloth/gpt-oss-20b-unsloth-bnb-4bit" &&
  EVAL_PINS.immutableDistributionRevision ===
    "093fba6992ef5a7152481afec0bdfca1ac486998"
);

if (existsSync(PLAN)) {
  const plan = JSON.parse(readFileSync(PLAN, "utf8"));

  check(
    "launch plan points to DEC-0044",
    plan.authorizationDecisionId === "DEC-0044"
  );

  check(
    "launch plan identifies attempt #5",
    plan.attemptNumber === 5
  );

  check(
    "launch plan preserves ONE-push bound",
    plan.maximumKernelPushes === 1
  );

  check(
    "launch plan records DEC-0038 as prior evaluation authorization",
    plan.priorAuthorizationDecisionId === "DEC-0038"
  );

  check(
    "launch plan is still not launched",
    plan.launchAttempted === false &&
    plan.testInferenceOccurred === false &&
    plan.metricValuesProduced === 0
  );
} else {
  failures.push("launch plan missing — run eval:bundle first");
}

if (failures.length) {
  console.error("");
  console.error(`ATTEMPT #5 LAUNCH GATE: FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("");
console.log("ATTEMPT #5 LAUNCH GATE: PASSED");
console.log("KAGGLE PUSH IS NOT EXECUTED BY THIS GATE.");