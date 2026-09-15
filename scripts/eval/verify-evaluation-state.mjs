#!/usr/bin/env node
/**
 * verify-evaluation-state.mjs — deterministic PASS/FAIL verifier for the evaluation layer.
 *
 * WHAT IT PROTECTS
 * ----------------
 * The evaluation layer is the one place in this repository where a NUMBER can be invented
 * without anyone noticing. A null is honest; a zero looks like a measurement. This verifier
 * exists so that the difference is machine-checked on every run, not left to a reviewer's
 * attention.
 *
 * It asserts, against the committed master state:
 *
 *   1. NO SCORE EXISTS WITHOUT AN EXECUTION. `evaluationResults` is 0 and the experiment's
 *      `evaluationStatus` is `NOT_RUN` unless a real benchmark run registered scores. If a
 *      score-carrying state ever appears, it must carry the run evidence that produced it.
 *   2. THE NOT_RUN RULE HOLDS. No score field anywhere in the evaluation layer carries a
 *      placeholder (`0`, `"N/A"`, `"-"`, `"TBD"`) where `null` is required.
 *   3. THE AUTHORIZATION IS INTACT AND UNCONSUMED. DEC-0032 is ACCEPTED, unsuperseded, and the
 *      single benchmark execution it granted has not been spent unless scores exist.
 *   4. AN INFRASTRUCTURE BLOCKER IS RECORDED AS A BLOCKER. If BLK-0004 is OPEN, the state must
 *      simultaneously assert `testInferenceOccurred: false`, `testRecordsParsed: 0` and
 *      `metricValuesProduced: 0` — i.e. the claim "we did not measure" is explicit.
 *   5. TEST REMAINS ISOLATED. The leakage audit record exists, PASSED, is hash/ID-only, and
 *      still reports `testAudited: 0`.
 *   6. NO PROMOTION. `GHARIBO-V0.1` is `NOT_CREATED` and the experiment is not `promotable`.
 *   7. TRAINING IS UNCHANGED. `training.status` is `COMPLETED` with `hasStarted: true`.
 *
 * Exit code 0 = PASS, 1 = FAIL. No network, no clock, no randomness: re-running this on the
 * same commit must produce the same verdict.
 *
 * Usage:
 *   node scripts/eval/verify-evaluation-state.mjs
 *   node scripts/eval/verify-evaluation-state.mjs --verbose
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASTER_STATE_REL = "governance/GHARIBO_MASTER_STATE.json";
const LEAKAGE_AUDIT_REL = "governance/EVALUATION-LEAKAGE-AUDIT.json";
const DEC0032_REL = "governance/DEC-0032-evaluation-authorization.json";
const DEC0033_REL = "governance/DEC-0033-evaluation-infrastructure-blocker.json";

const args = process.argv.slice(2);
const VERBOSE = args.includes("--verbose");

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: Boolean(ok), detail: detail ?? "" });
};

const readJson = (rel) => {
  const path = resolve(ROOT, rel);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
};

/** sha256-shaped? The repo uses 64-hex everywhere; a truncated hash is a silent identity bug. */
const isSha256 = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

/** Values that must never stand in for a score (RESEARCH_BENCHMARK.md §9). */
const FORBIDDEN_PLACEHOLDERS = [0, "0", "N/A", "n/a", "-", "TBD", "tbd", "", "null", "unknown"];

// ------------------------------------------------------------------------- load inputs
const state = readJson(MASTER_STATE_REL);
const leakage = readJson(LEAKAGE_AUDIT_REL);
const dec0032 = readJson(DEC0032_REL);
const dec0033 = readJson(DEC0033_REL);

check("master state parses", state !== null, MASTER_STATE_REL);
check("leakage audit parses", leakage !== null, LEAKAGE_AUDIT_REL);
check("DEC-0032 parses", dec0032 !== null, DEC0032_REL);
check("DEC-0033 parses", dec0033 !== null, DEC0033_REL);

if (!state || !leakage || !dec0032 || !dec0033) {
  report();
}

const training = state.training ?? {};
const experiment = state.experiments?.["GHARIBO-exp-001"] ?? {};
const evalAuth = training.evaluationAuthorization ?? {};
const blockers = Array.isArray(state.blockers) ? state.blockers : [];
const decisions = Array.isArray(state.decisions) ? state.decisions : [];
const derivedModels = state.models?.derivedModels ?? [];

// ------------------------------------------------------- 1. no score without execution
const results_count = training.evaluationResults;
check(
  "evaluationResults is 0 (no execution registered)",
  results_count === 0,
  `evaluationResults=${JSON.stringify(results_count)}`,
);
check(
  "experiment.evaluationStatus is NOT_RUN",
  experiment.evaluationStatus === "NOT_RUN",
  `evaluationStatus=${JSON.stringify(experiment.evaluationStatus)}`,
);
check(
  "experiment.runStatus is COMPLETED (training unchanged)",
  experiment.runStatus === "COMPLETED",
  `runStatus=${JSON.stringify(experiment.runStatus)}`,
);

// ----------------------------------------------- 2. NOT_RUN rule: no placeholder scores
// The evaluation layer must not carry a fabricated number. We scan the two blocks that could
// legitimately hold scores later, and reject placeholders while evaluationResults is 0.
const SCORE_KEYS = [
  "schema_validity",
  "extraction_accuracy",
  "classification_accuracy",
  "source_fidelity",
  "source_coverage",
  "unsupported_claim_rate",
  "empty_output_rate",
  "duplicate_rate",
  "dedup_f1",
  "relation_f1",
  "instruction_following",
  "structured_output_reliability",
  "record_precision",
  "benchmark_score",
];
const scoreContainers = [];
for (const [label, container] of [
  ["training.evaluation", training.evaluation],
  ["training.evaluationAuthorization.scores", training.evaluationAuthorization?.scores],
  ["experiments.GHARIBO-exp-001.scores", experiment.scores],
  ["experiments.GHARIBO-exp-001.evaluation", experiment.evaluation],
]) {
  if (container && typeof container === "object") scoreContainers.push([label, container]);
}
const placeholderHits = [];
for (const [label, container] of scoreContainers) {
  for (const key of SCORE_KEYS) {
    if (!(key in container)) continue;
    const value = container[key];
    if (value === null) continue;
    if (FORBIDDEN_PLACEHOLDERS.includes(value)) {
      placeholderHits.push(`${label}.${key}=${JSON.stringify(value)}`);
    }
  }
}
check(
  "no placeholder scores where null is required (NOT_RUN rule)",
  placeholderHits.length === 0,
  placeholderHits.length ? placeholderHits.join(", ") : "no non-null score fields present",
);

// ----------------------------------------------------- 3. authorization intact/unconsumed
const evalAuthHash = evalAuth.authorizationHash;
check(
  "evaluation authorization hash is a full sha256",
  isSha256(evalAuthHash),
  `authorizationHash=${evalAuthHash}`,
);
check(
  "evaluation authorization decision id is DEC-0032",
  evalAuth.decisionId === "DEC-0032",
  `decisionId=${JSON.stringify(evalAuth.decisionId)}`,
);
check(
  "DEC-0032 is ACCEPTED, unsuperseded",
  decisions.filter((d) => d?.id === "DEC-0032").length === 1 &&
    decisions.find((d) => d?.id === "DEC-0032")?.status === "ACCEPTED" &&
    decisions.find((d) => d?.id === "DEC-0032")?.supersedes === null &&
    decisions.find((d) => d?.id === "DEC-0032")?.supersededBy === null,
  "DEC-0032 status/supersession",
);
check(
  "blocker BLK-0003 is CLOSED by DEC-0032",
  blockers.find((b) => b?.id === "BLK-0003")?.status === "CLOSED" &&
    blockers.find((b) => b?.id === "BLK-0003")?.closedByDecisionId === "DEC-0032",
  "BLK-0003 closure",
);

// ------------------------------- 4. an infrastructure blocker is recorded AS a blocker
const infraBlocker = blockers.find((b) => b?.id === "BLK-0004");
if (infraBlocker && infraBlocker.status === "OPEN") {
  check(
    "BLK-0004 OPEN implies testInferenceOccurred === false",
    evalAuth.testInferenceOccurred === false,
    `testInferenceOccurred=${JSON.stringify(evalAuth.testInferenceOccurred)}`,
  );
  check(
    "BLK-0004 OPEN implies testRecordsParsed === 0",
    evalAuth.testRecordsParsed === 0,
    `testRecordsParsed=${JSON.stringify(evalAuth.testRecordsParsed)}`,
  );
  check(
    "BLK-0004 OPEN implies metricValuesProduced === 0",
    evalAuth.metricValuesProduced === 0,
    `metricValuesProduced=${JSON.stringify(evalAuth.metricValuesProduced)}`,
  );
  check(
    "BLK-0004 OPEN implies executionSucceeded === false",
    evalAuth.executionSucceeded === false,
    `executionSucceeded=${JSON.stringify(evalAuth.executionSucceeded)}`,
  );
  check(
    "BLK-0004 OPEN implies authorizationConsumed === false",
    evalAuth.authorizationConsumed === false,
    `authorizationConsumed=${JSON.stringify(evalAuth.authorizationConsumed)}`,
  );
  check(
    "BLK-0004 OPEN implies DEC-0033 records it",
    evalAuth.executionBlockerResolutionId === "DEC-0033" &&
      evalAuth.executionBlockerRecord === DEC0033_REL &&
      isSha256(evalAuth.executionBlockerHash),
    `resolutionId=${JSON.stringify(evalAuth.executionBlockerResolutionId)}`,
  );
  check(
    "DEC-0033 is ACCEPTED, unsuperseded",
    decisions.filter((d) => d?.id === "DEC-0033").length === 1 &&
      decisions.find((d) => d?.id === "DEC-0033")?.status === "ACCEPTED" &&
      decisions.find((d) => d?.id === "DEC-0033")?.supersedes === null &&
      decisions.find((d) => d?.id === "DEC-0033")?.supersededBy === null,
    "DEC-0033 status/supersession",
  );
} else if (results_count > 0) {
  // Once real results exist, the blocker must have been closed by that work.
  check(
    "results registered implies BLK-0004 is CLOSED",
    infraBlocker?.status === "CLOSED",
    `BLK-0004 status=${JSON.stringify(infraBlocker?.status)}`,
  );
} else {
  check("BLK-0004 state is coherent", false, "BLK-0004 missing while evaluationResults is 0");
}

// ------------------------------------------------------------ 5. TEST remains isolated
check("leakage audit status is PASS", leakage.status === "PASS", `status=${leakage.status}`);
check(
  "leakage audit is hash/ID-only (no TEST content inspected)",
  leakage.kind === "HASH_AND_ID_ONLY_NO_TEST_CONTENT_INSPECTED",
  `kind=${JSON.stringify(leakage.kind)}`,
);
check("leakage audit came from a full sha256 split", isSha256(leakage.pinned?.testSplitHash), "pinned.testSplitHash");
check(
  "no TEST record falls inside the audit cohort",
  leakage.auditCohort?.testAudited === 0,
  `testAudited=${JSON.stringify(leakage.auditCohort?.testAudited)}`,
);
check(
  "TEST record count is 80",
  evalAuth.testRecordCount === 80,
  `testRecordCount=${JSON.stringify(evalAuth.testRecordCount)}`,
);

// -------------------------------------------------------------------- 6. no promotion
check(
  "experiment is not promotable",
  experiment.promotable === false,
  `promotable=${JSON.stringify(experiment.promotable)}`,
);
const v01 = derivedModels.find((m) => m?.id === "GHARIBO-V0.1");
check(
  "GHARIBO-V0.1 is NOT_CREATED",
  v01?.status === "NOT_CREATED",
  `status=${JSON.stringify(v01?.status)}`,
);

// -------------------------------------------------------------- 7. training unchanged
check("training.status is COMPLETED", training.status === "COMPLETED", `status=${training.status}`);
check("training.hasStarted is true", training.hasStarted === true, `hasStarted=${training.hasStarted}`);
check(
  "candidate adapter identity is a full sha256",
  isSha256(evalAuth.candidateAdapterSha256),
  `candidateAdapterSha256=${evalAuth.candidateAdapterSha256}`,
);
check(
  "base model revision is a full 40-hex revision",
  typeof evalAuth.baseModelRevision === "string" &&
    /^[0-9a-f]{40}$/.test(evalAuth.baseModelRevision),
  `baseModelRevision=${evalAuth.baseModelRevision}`,
);

report();

function report() {
  const failures = results.filter((r) => !r.ok);
  console.log("────────────────────────────────────────────────────────────────");
  console.log("GHARIBO AI LAB — evaluation state verification");
  console.log("────────────────────────────────────────────────────────────────");
  for (const r of results) {
    const tag = r.ok ? "PASS" : "FAIL";
    console.log(`  ${tag}  [eval] ${r.name}`);
    if (VERBOSE || !r.ok) console.log(`          ${r.detail}`);
  }
  console.log("────────────────────────────────────────────────────────────────");
  if (failures.length === 0) {
    console.log(`RESULT: PASSED — ${results.length} check(s), evaluation layer is honest.`);
    process.exit(0);
  }
  console.log(`RESULT: FAILED — ${failures.length} of ${results.length} check(s) failed.`);
  process.exit(1);
}
