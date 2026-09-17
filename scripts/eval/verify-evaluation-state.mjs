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
import { createHash } from "node:crypto";
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
  "experiment.evaluationStatus records no evaluation RESULT (NOT_RUN, or the DEC-0048 non-decisional closure)",
  // DEC-0048 recorded that Evaluation Attempt #6 completed inference over the
  // consumed TEST split and that the first scoring pass was NON-DECISIONAL. The
  // literal status therefore moved past NOT_RUN while still producing no score.
  // The invariant this check exists to protect is "no evaluation result", which
  // is asserted directly and independently below.
  experiment.evaluationStatus === "NOT_RUN" ||
    experiment.evaluationStatus ===
      "ATTEMPT_6_INFERENCE_COMPLETE_SCORING_NON_DECISIONAL",
  `evaluationStatus=${JSON.stringify(experiment.evaluationStatus)}`,
);
check(
  "experiment.evaluationScore is null (no score exists, whatever the status)",
  experiment.evaluationScore === null,
  `evaluationScore=${JSON.stringify(experiment.evaluationScore)}`,
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
} else if (infraBlocker && infraBlocker.status === "CLOSED" && evalAuth.escalationDecisionId) {
  // The fourth legitimate case, and the one this project actually reached: the blocker is CLOSED
  // by a launch, no result exists, and the run is NOT in flight because it has failed a THIRD time
  // pre-inference and the repair loop has been HALTED pending a CEO decision.
  //
  // This state invites a specific fraud: reading "still technically unspent" as "clear to retry".
  // The branch therefore requires the halt to be recorded, the counts to be honest, and — the
  // load-bearing check — `furtherAttemptAuthorized === false`. A harness that re-authorizes itself
  // after three failures is exactly what this layer exists to make impossible.
  check(
    "third pre-inference failure is recorded as a failure",
    evalAuth.thirdLaunchOutcome === "FAILED_PRE_INFERENCE" &&
      evalAuth.thirdLaunchFailureClass === "HARNESS_DEFECT_NO_EXECUTION" &&
      evalAuth.thirdLaunchFailureDefectId === "DEF-0036-E",
    `thirdLaunchOutcome=${JSON.stringify(evalAuth.thirdLaunchOutcome)} defect=${JSON.stringify(evalAuth.thirdLaunchFailureDefectId)}`,
  );
  // The fourth legitimate case, and the one this project actually reached: the blocker is CLOSED
  // by a launch, no result exists, and the run is NOT in flight because it has failed a THIRD time
  // pre-inference and the repair loop has been HALTED pending a CEO decision.
  //
  // This state invites a specific fraud: reading "still technically unspent" as "clear to retry".
  // The branch therefore requires the halt to be recorded, the counts to be honest, and — the
  // load-bearing check — `furtherAttemptAuthorized === false`. A harness that re-authorizes itself
  // after three failures is exactly what this layer exists to make impossible.
  check(
    "third pre-inference failure is recorded as a failure",
    evalAuth.thirdLaunchOutcome === "FAILED_PRE_INFERENCE" &&
      evalAuth.thirdLaunchFailureClass === "HARNESS_DEFECT_NO_EXECUTION" &&
      evalAuth.thirdLaunchFailureDefectId === "DEF-0036-E",
    `thirdLaunchOutcome=${JSON.stringify(evalAuth.thirdLaunchOutcome)} defect=${JSON.stringify(evalAuth.thirdLaunchFailureDefectId)}`,
  );
  check(
    "the third failure occurred before any model object existed",
    evalAuth.thirdLaunchTestInferenceOccurred === false &&
      evalAuth.thirdLaunchModelObjectConstructed === false,
    `inference=${JSON.stringify(evalAuth.thirdLaunchTestInferenceOccurred)} model=${JSON.stringify(evalAuth.thirdLaunchModelObjectConstructed)}`,
  );
  check(
    "the harness-repair loop is recorded as HALTED",
    evalAuth.harnessRepairLoopHalted === true,
    `harnessRepairLoopHalted=${JSON.stringify(evalAuth.harnessRepairLoopHalted)}`,
  );
  check(
    "NO fourth attempt is authorized",
    evalAuth.furtherAttemptAuthorized === false &&
      evalAuth.furtherAttemptRequiresNewDecision === true,
    `furtherAttemptAuthorized=${JSON.stringify(evalAuth.furtherAttemptAuthorized)}`,
  );
  check(
    "consumed but NOT spent: no TEST inference occurred, so hardStops[2] is unsatisfied",
    evalAuth.authorizationConsumed === true &&
      evalAuth.authorizationSpent === false &&
      evalAuth.hardStops2Satisfied === false &&
      evalAuth.hardStops3Satisfied === true,
    `consumed=${JSON.stringify(evalAuth.authorizationConsumed)} spent=${JSON.stringify(evalAuth.authorizationSpent)}`,
  );
  check(
    "at least three launches, at least five defect classes, and zero metric values",
    // The escalation's own record is three launches and five defect classes. A LATER, separately
    // authorized attempt (#4, DEC-0038/0039/0040) legitimately raises both counters, so these are
    // asserted as FLOORS here: the point is that neither count may round DOWN below the escalated
    // record, and that the metric count may not round UP.
    evalAuth.launchAttempts >= 3 &&
      evalAuth.defectClassesFound >= 5 &&
      evalAuth.metricValuesProducedAfterThreeLaunches === 0 &&
      evalAuth.metricValuesProduced === 0,
    `attempts=${JSON.stringify(evalAuth.launchAttempts)} defects=${JSON.stringify(evalAuth.defectClassesFound)} metrics=${JSON.stringify(evalAuth.metricValuesProduced)}`,
  );
  check(
    "the harness-repair loop is still HALTED and no further attempt is authorized",
    evalAuth.harnessRepairLoopHalted === true &&
      evalAuth.furtherAttemptAuthorized === false &&
      evalAuth.furtherAttemptRequiresNewDecision === true,
    `halted=${JSON.stringify(evalAuth.harnessRepairLoopHalted)} furtherAttemptAuthorized=${JSON.stringify(evalAuth.furtherAttemptAuthorized)}`,
  );
  check(
    "nothing was downloaded, scored, or parsed locally",
    evalAuth.testRecordsParsedLocally === 0 &&
      evalAuth.predictionsDownloaded === false &&
      evalAuth.scoringPerformed === false &&
      evalAuth.executionSucceeded === false,
    `parsed=${JSON.stringify(evalAuth.testRecordsParsedLocally)} downloaded=${JSON.stringify(evalAuth.predictionsDownloaded)} scored=${JSON.stringify(evalAuth.scoringPerformed)}`,
  );
  check(
    "BLK-0004 CLOSED by the launch decisions, not annotatively",
    Array.isArray(infraBlocker.closedBy) && infraBlocker.closedBy.includes("DEC-0035"),
    `closedBy=${JSON.stringify(infraBlocker.closedBy)}`,
  );
  check(
    "DEC-0034, DEC-0035 and DEC-0036 are all ACCEPTED and unsuperseded",
    ["DEC-0034", "DEC-0035", "DEC-0036"].every((id) => {
      const d = decisions.filter((x) => x?.id === id);
      return (
        d.length === 1 &&
        d[0].status === "ACCEPTED" &&
        d[0].supersedes === null &&
        d[0].supersededBy === null
      );
    }),
    "DEC-0034/DEC-0035/DEC-0036 status/supersession",
  );
  check(
    "DEC-0036 escalation record path is declared",
    evalAuth.escalationRecord === "governance/DEC-0036-evaluation-escalation.json" &&
      typeof evalAuth.escalationHash === "string" &&
      /^[0-9a-f]{64}$/.test(evalAuth.escalationHash),
    `escalationRecord=${JSON.stringify(evalAuth.escalationRecord)}`,
  );
} else if (infraBlocker && infraBlocker.status === "CLOSED") {
  // The third legitimate case: the blocker is CLOSED by a LAUNCH, but no result exists yet
  // because the run is still in flight. This is the state the DEC-0034/DEC-0035 checkpoint
  // introduced, and it is the one that most invites a fabricated score — a closed blocker looks
  // like progress, and "the run is finished, here is the number" is the natural next line to
  // write. So this branch is deliberately the STRICTEST of the three: closing the blocker
  // without a result is only coherent while nothing has been measured, and the state must carry
  // the machine-readable promise that a further attempt needs a new human decision.
  check(
    "BLK-0004 CLOSED without results implies the run is still in flight",
    evalAuth.evaluationStatusAfterLaunch === "EVALUATION_BENCHMARK_IN_FLIGHT",
    `evaluationStatusAfterLaunch=${JSON.stringify(evalAuth.evaluationStatusAfterLaunch)}`,
  );
  check(
    "BLK-0004 CLOSED without results implies no metric value was produced",
    evalAuth.metricValuesProduced === 0,
    `metricValuesProduced=${JSON.stringify(evalAuth.metricValuesProduced)}`,
  );
  check(
    "BLK-0004 CLOSED without results implies nothing was parsed locally",
    evalAuth.testRecordsParsedLocally === 0,
    `testRecordsParsedLocally=${JSON.stringify(evalAuth.testRecordsParsedLocally)}`,
  );
  check(
    "BLK-0004 CLOSED without results implies executionSucceeded === false",
    evalAuth.executionSucceeded === false,
    `executionSucceeded=${JSON.stringify(evalAuth.executionSucceeded)}`,
  );
  check(
    "BLK-0004 CLOSED by the launch decisions, not annotatively",
    Array.isArray(infraBlocker.closedBy) && infraBlocker.closedBy.includes("DEC-0035"),
    `closedBy=${JSON.stringify(infraBlocker.closedBy)}`,
  );
  check(
    "the launch records its PRE-INFERENCE failure rather than dropping it",
    evalAuth.launchOutcome === "FAILED_PRE_INFERENCE" &&
      evalAuth.launchFailureTestInferenceOccurred === false,
    `launchOutcome=${JSON.stringify(evalAuth.launchOutcome)}`,
  );
  check(
    "the authorization is consumed exactly once and no further attempt is authorized",
    evalAuth.authorizationConsumed === true &&
      evalAuth.furtherAttemptAuthorized === false &&
      evalAuth.furtherAttemptRequiresNewDecision === true,
    `consumed=${JSON.stringify(evalAuth.authorizationConsumed)} further=${JSON.stringify(evalAuth.furtherAttemptAuthorized)}`,
  );
  check(
    "DEC-0034 and DEC-0035 are both ACCEPTED and unsuperseded",
    ["DEC-0034", "DEC-0035"].every((id) => {
      const d = decisions.filter((x) => x?.id === id);
      return (
        d.length === 1 &&
        d[0].status === "ACCEPTED" &&
        d[0].supersedes === null &&
        d[0].supersededBy === null
      );
    }),
    "DEC-0034/DEC-0035 status/supersession",
  );
} else {
  check("BLK-0004 state is coherent", false, "BLK-0004 missing while evaluationResults is 0");
}

// --------------------------------------------------------------------------------------------
// SECTION 4b — EVALUATION ATTEMPT #4 (DEC-0038 / DEC-0039 / DEC-0040)
// --------------------------------------------------------------------------------------------
// Attempt #4 is the first attempt in this project whose failure is NOT the same defect it was
// launched to exercise. It was authorized exactly ONCE (DEC-0038, one kernel push), pushed once
// (DEC-0039, zero remaining), failed PRE-INFERENCE at model load (DEC-0040), and was NOT repaired
// or retried. This section exists to make four specific frauds impossible:
//
//   FRAUD 1 — "the kernel ran, so something was measured." The log is machine-scanned for the
//     inference markers; the count must be zero, no prediction file may exist, and no run record
//     may have been written. The evidence is DERIVED by a committed script, never asserted here.
//   FRAUD 2 — "it failed, so go again." The authorization is EXHAUSTED: one push performed, zero
//     remaining, retries 0, repair false, fifth attempt false, and a further attempt requires a
//     NEW human decision. A harness that re-authorizes itself after four failures is the exact
//     failure mode this section makes impossible.
//   FRAUD 3 — "the 404 caused it, and it is fatal anyway." BOTH halves of the contrast are
//     observed: attempt #4 hit the identical 404 at the mutable ref "main" and FAILED, while
//     DEC-0037 hit it at the immutable commit SHA and PASSED. The defect is therefore recorded as
//     NOT inherently fatal. What is NOT observed is that the preceding Xet transport error CAUSED
//     the fallback — so transport causation must still read UNPROVEN_NOT_ASSERTED. Overclaiming
//     the cause would be as dishonest as overclaiming a score.
//   FRAUD 4 — "the number arrived late." This block runs BEFORE the results branch above and
//     re-asserts the zero. If a result is ever registered while this attempt's evidence is
//     missing, the checks below fail rather than silently reconciling.
if (evalAuth.attempt4AuthorizationDecisionId) {
  check(
    "attempt #4 authorization is DEC-0038, ACCEPTED, unsuperseded, and pinned by sha256",
    evalAuth.attempt4AuthorizationDecisionId === "DEC-0038" &&
      evalAuth.attempt4AuthorizationRecord ===
        "governance/DEC-0038-evaluation-attempt-4-authorization.json" &&
      isSha256(evalAuth.attempt4AuthorizationHash) &&
      decisions.filter((d) => d?.id === "DEC-0038").length === 1 &&
      decisions.find((d) => d?.id === "DEC-0038")?.status === "ACCEPTED" &&
      decisions.find((d) => d?.id === "DEC-0038")?.supersedes === null &&
      decisions.find((d) => d?.id === "DEC-0038")?.supersededBy === null,
    `id=${JSON.stringify(evalAuth.attempt4AuthorizationDecisionId)} hash=${JSON.stringify(evalAuth.attempt4AuthorizationHash)}`,
  );
  check(
    "attempt #4 is the FOURTH attempt, authorized WITH LIMITS, amending — not replacing — DEC-0036",
    evalAuth.attempt4Number === 4 &&
      evalAuth.attempt4AuthorizationStatus === "AUTHORIZED_WITH_LIMITS" &&
      evalAuth.attempt4Number > 3,
    `number=${JSON.stringify(evalAuth.attempt4Number)} status=${JSON.stringify(evalAuth.attempt4AuthorizationStatus)}`,
  );
  check(
    "attempt #4 is bounded to exactly ONE kernel push and BASE-then-CANDIDATE over the same 80 records",
    evalAuth.attempt4MaximumKernelPushes === 1 &&
      evalAuth.attempt4Arms?.length === 2 &&
      evalAuth.attempt4Arms?.[0] === "base" &&
      evalAuth.attempt4Arms?.[1] === "candidate" &&
      evalAuth.attempt4ArmOrder === "BASE_THEN_CANDIDATE" &&
      evalAuth.attempt4SameTestRecordsForBothArms === true &&
      evalAuth.attempt4TestRecordCount === 80 &&
      evalAuth.attempt4TestSplitHash ===
        "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    `maxPushes=${JSON.stringify(evalAuth.attempt4MaximumKernelPushes)} order=${JSON.stringify(evalAuth.attempt4ArmOrder)}`,
  );
  check(
    "the decoding contract is IDENTICAL across both arms (no tuning, no model selection)",
    evalAuth.attempt4DecodingIdenticalAcrossArms === true &&
      evalAuth.attempt4CandidateSettingsNotAlteredAfterBaseOutput === true &&
      evalAuth.attempt4TuningAuthorized === false &&
      evalAuth.attempt4ModelSelectionAuthorized === false &&
      evalAuth.attempt4PromotionAuthorized === false &&
      evalAuth.attempt4GhariboV01CreationAuthorized === false &&
      evalAuth.attempt4DatasetMutationAuthorized === false &&
      evalAuth.attempt4TestDrivenCodeOptimisationAuthorized === false &&
      evalAuth.attempt4AutomaticRetryAuthorized === false,
    `identical=${JSON.stringify(evalAuth.attempt4DecodingIdenticalAcrossArms)} tuningAuthorized=${JSON.stringify(evalAuth.attempt4TuningAuthorized)}`,
  );
  check(
    "attempt #4 reuses the DEC-0037 PROVEN loader path and forbids redesign",
    evalAuth.attempt4LoaderConventionProvenBy === "DEC-0037" &&
      typeof evalAuth.attempt4LoaderConvention === "string" &&
      evalAuth.attempt4RedesignForbidden === true &&
      evalAuth.attempt4AdditionalChatTemplates404Status === "REPRODUCED_AND_NON_FATAL",
    `provenBy=${JSON.stringify(evalAuth.attempt4LoaderConventionProvenBy)} redesignForbidden=${JSON.stringify(evalAuth.attempt4RedesignForbidden)}`,
  );
  check(
    "starting TEST inference spends the authorization; a pre-inference failure stops the run",
    evalAuth.attempt4AuthorizationSpentOnInferenceStart === true &&
      typeof evalAuth.attempt4OnPreInferenceFailure === "string" &&
      /no repair-and-retry/i.test(evalAuth.attempt4OnPreInferenceFailure) &&
      /no attempt #5/i.test(evalAuth.attempt4OnPreInferenceFailure),
    `spentOnStart=${JSON.stringify(evalAuth.attempt4AuthorizationSpentOnInferenceStart)} onFailureIsPolicy=${typeof evalAuth.attempt4OnPreInferenceFailure === "string"}`,
  );

  // ---- the launch (DEC-0039) -----------------------------------------------------------------
  check(
    "the ONE push was performed, it is DEC-0039, and ZERO pushes remain",
    evalAuth.attempt4LaunchDecisionId === "DEC-0039" &&
      evalAuth.attempt4LaunchRecord ===
        "governance/DEC-0039-evaluation-attempt-4-launch.json" &&
      isSha256(evalAuth.attempt4LaunchHash) &&
      evalAuth.attempt4Pushed === true &&
      evalAuth.attempt4KernelPushesPerformed === 1 &&
      evalAuth.attempt4KernelPushesRemaining === 0 &&
      evalAuth.attempt4RetryAuthorized === false,
    `pushed=${JSON.stringify(evalAuth.attempt4Pushed)} performed=${JSON.stringify(evalAuth.attempt4KernelPushesPerformed)} remaining=${JSON.stringify(evalAuth.attempt4KernelPushesRemaining)}`,
  );
  check(
    "the launch is pinned to a concrete kernel version and artifact hashes",
    evalAuth.attempt4KernelId === "vokaigharibo/gharibo-eval-001-fec22ca2" &&
      evalAuth.attempt4KernelVersion === 3 &&
      isSha256(evalAuth.attempt4NotebookSha256AsPushed) &&
      isSha256(evalAuth.attempt4LaunchBundleHashAsPushed),
    `kernel=${JSON.stringify(evalAuth.attempt4KernelId)} version=${JSON.stringify(evalAuth.attempt4KernelVersion)}`,
  );
  check(
    "the launch record itself does not claim an outcome it could not yet know",
    // At launch time the only honest observation was RUNNING. The value on disk now reads ERROR
    // because it was RECONCILED BY THE FAILURE RECORD (DEC-0040) — not because the launch record
    // foretold it. Either is acceptable HERE, but the metric count must be zero and the status must
    // never be a SUCCESS-class value, which would mean a result was implied without one existing.
    evalAuth.attempt4MetricValuesProduced === 0 &&
      ["RUNNING", "ERROR"].includes(evalAuth.attempt4KernelStatusAtRecordTime),
    `metricsAtLaunch=${JSON.stringify(evalAuth.attempt4MetricValuesProduced)} statusAtRecord=${JSON.stringify(evalAuth.attempt4KernelStatusAtRecordTime)}`,
  );

  // ---- the failure (DEC-0040) ----------------------------------------------------------------
  check(
    "attempt #4 failed PRE-INFERENCE and is recorded as a FAILURE, not as an outcome",
    evalAuth.attempt4Status === "FAILED_PRE_INFERENCE" &&
      evalAuth.attempt4Outcome === "FAILED_PRE_INFERENCE" &&
      evalAuth.attempt4FailureDecisionId === "DEC-0040" &&
      evalAuth.attempt4FailureRecord ===
        "governance/DEC-0040-evaluation-attempt-4-failure.json" &&
      isSha256(evalAuth.attempt4FailureHash) &&
      evalAuth.attempt4FailureClass === "HARNESS_DEFECT_NO_EXECUTION",
    `status=${JSON.stringify(evalAuth.attempt4Status)} failureDecision=${JSON.stringify(evalAuth.attempt4FailureDecisionId)}`,
  );
  check(
    "the failure occurred at MODEL LOAD, before any model object existed",
    evalAuth.attempt4FailurePhase === "MODEL_LOAD" &&
      evalAuth.attempt4FailureDefectId === "DEF-0040-A" &&
      evalAuth.attempt4ModelObjectConstructed === false &&
      evalAuth.attempt4PredictionFilesProduced === 0,
    `phase=${JSON.stringify(evalAuth.attempt4FailurePhase)} defect=${JSON.stringify(evalAuth.attempt4FailureDefectId)} modelObject=${JSON.stringify(evalAuth.attempt4ModelObjectConstructed)}`,
  );
  check(
    "the failure evidence was DERIVED from the log by a committed script, never asserted",
    evalAuth.attempt4FailureEvidenceScript ===
      "scripts/eval/verify-eval-failure-evidence.py" &&
      evalAuth.attempt4FailureEvidenceResult === "PASSED_4_OF_4_PRE_INFERENCE" &&
      isSha256(evalAuth.attempt4FailureLogSha256),
    `evidence=${JSON.stringify(evalAuth.attempt4FailureEvidenceResult)} logSha256=${JSON.stringify(evalAuth.attempt4FailureLogSha256)}`,
  );
  check(
    "the decisive revision finding is recorded, and its unproven half stays UNPROVEN",
    // The 404 is NOT inherently fatal: DEC-0037 survived the identical 404 at the pinned commit
    // SHA. Attempt #4 hit it at the mutable ref "main". Both halves are OBSERVED. What is NOT
    // observed is that the preceding Xet transport error CAUSED the fallback — so that half must
    // still read UNPROVEN, and the contrast must be recorded as the decisive finding it is.
    evalAuth.attempt4ResolvedRevisionObserved === "main" &&
      evalAuth.attempt4ResolvedRevisionKind === "MUTABLE_REF_NAME" &&
      evalAuth.attempt4ContrastResolvedRevision ===
        "093fba6992ef5a7152481afec0bdfca1ac486998" &&
      evalAuth.attempt4ContrastResolvedRevisionKind === "IMMUTABLE_COMMIT_SHA" &&
      evalAuth.attempt4ContrastOutcome === "PASS" &&
      evalAuth.attempt4SameDefectIsNotInherentlyFatal === true &&
      evalAuth.attempt4TransportCausationStatus === "UNPROVEN_NOT_ASSERTED",
    `observed=${JSON.stringify(evalAuth.attempt4ResolvedRevisionObserved)} causality=${JSON.stringify(evalAuth.attempt4TransportCausationStatus)}`,
  );
  check(
    "remedies were IDENTIFIED but NOT APPLIED — evaluation, not harness development",
    evalAuth.attempt4RemediesIdentifiedNotApplied === true,
    `remediesIdentifiedNotApplied=${JSON.stringify(evalAuth.attempt4RemediesIdentifiedNotApplied)}`,
  );
  check(
    "DEC-0038, DEC-0039 and DEC-0040 are each present exactly once, ACCEPTED, and unsuperseded",
    // THE LEDGER, not just the filesystem. Removing DEC-0039 from the ledger would erase the record
    // of the ONE push that was authorized and spent; superseding DEC-0040 would quietly set the
    // failure aside. In both cases the three JSON record files would still sit on disk and every
    // on-disk check below would keep passing — so the ledger entries themselves are asserted here.
    ["DEC-0038", "DEC-0039", "DEC-0040"].every((id) => {
      const d = decisions.filter((x) => x?.id === id);
      return (
        d.length === 1 &&
        d[0].status === "ACCEPTED" &&
        d[0].supersedes === null &&
        d[0].supersededBy === null
      );
    }),
    ["DEC-0038", "DEC-0039", "DEC-0040"]
      .map((id) => {
        const d = decisions.filter((x) => x?.id === id);
        return `${id}:n=${d.length},status=${JSON.stringify(d[0]?.status)},supersededBy=${JSON.stringify(d[0]?.supersededBy)}`;
      })
      .join(" "),
  );
  check(
    "the launch and failure records are pinned by sha256",
    isSha256(evalAuth.attempt4LaunchHash) && isSha256(evalAuth.attempt4FailureHash),
    `launchHash=${JSON.stringify(evalAuth.attempt4LaunchHash)} failureHash=${JSON.stringify(evalAuth.attempt4FailureHash)}`,
  );

  // ---- enforcement of the handoff's failure policy -------------------------------------------
  check(
    "NO retry, NO repair, NO fifth attempt: a further attempt requires a NEW human decision",
    evalAuth.attempt4RetriesPerformed === 0 &&
      evalAuth.attempt4RepairPerformed === false &&
      evalAuth.attempt4RetryAuthorized === false &&
      evalAuth.attempt4FifthAttemptAuthorized === false &&
      evalAuth.attempt4AutomaticRetryAuthorized === false &&
      evalAuth.attempt4FurtherAttemptRequiresNewDecision === true &&
      evalAuth.harnessRepairLoopHalted === true &&
      evalAuth.furtherAttemptAuthorized === false,
    `retries=${JSON.stringify(evalAuth.attempt4RetriesPerformed)} repaired=${JSON.stringify(evalAuth.attempt4RepairPerformed)} fifthAuthorized=${JSON.stringify(evalAuth.attempt4FifthAttemptAuthorized)}`,
  );
  check(
    "attempt #4 is recorded as an EXHAUSTED one-push authorization",
    evalAuth.attempt4AuthorizationState ===
      "EXHAUSTED_ONE_PUSH_CONSUMED_ZERO_REMAINING",
    `state=${JSON.stringify(evalAuth.attempt4AuthorizationState)}`,
  );
  check(
    "attempt #4 produced ZERO metric values, nothing was downloaded, nothing was scored",
    evalAuth.attempt4MetricValuesProduced === 0 &&
      evalAuth.metricValuesProduced === 0 &&
      evalAuth.predictionsDownloaded === false &&
      evalAuth.scoringPerformed === false &&
      evalAuth.testRecordsParsedLocally === 0,
    `metrics=${JSON.stringify(evalAuth.attempt4MetricValuesProduced)} scored=${JSON.stringify(evalAuth.scoringPerformed)} downloaded=${JSON.stringify(evalAuth.predictionsDownloaded)}`,
  );
  check(
    "attempt #4 did not touch the model: still NOT_RUN, zero results, still unpromoted",
    // `testInferenceOccurred` is a TRI-STATE, and attempt #4 is the reason it has a third value.
    // The baseline field was written while the run was still in flight and reads "POSSIBLY_IN_FLIGHT".
    // DEC-0040 then resolved it — for attempt #4 — to `false`, on evidence. The check therefore
    // requires the RESOLVED per-attempt value to be false, and separately requires the baseline to be
    // either the unresolved "POSSIBLY_IN_FLIGHT" or false: any other value (in particular `true`)
    // would mean TEST inference occurred and every zero below would be a lie.
    (evalAuth.attempt4TestInferenceOccurred === false) &&
      (evalAuth.testInferenceOccurred === "POSSIBLY_IN_FLIGHT" ||
        evalAuth.testInferenceOccurred === false) &&
      evalAuth.testRecordsParsed === 0 &&
      evalAuth.testRecordsParsedLocally === 0 &&
      evalAuth.executionSucceeded === false &&
      evalAuth.evaluationStatus === "NOT_RUN" &&
      evalAuth.evaluationResults === 0 &&
      results_count === 0 &&
      // See the note on the top-level status check: DEC-0048 moved the recorded
      // status past NOT_RUN for a non-decisional Attempt #6 while producing no
      // score. Both the status and the score are asserted, so nothing can hide
      // behind the wider status set.
      (experiment?.evaluationStatus === "NOT_RUN" ||
        experiment?.evaluationStatus ===
          "ATTEMPT_6_INFERENCE_COMPLETE_SCORING_NON_DECISIONAL") &&
      experiment?.evaluationScore === null &&
      experiment?.promotable === false,
    `attempt4Inference=${JSON.stringify(evalAuth.attempt4TestInferenceOccurred)} evaluationStatus=${JSON.stringify(evalAuth.evaluationStatus)} experimentStatus=${JSON.stringify(experiment?.evaluationStatus)} results=${JSON.stringify(results_count)} promotable=${JSON.stringify(experiment?.promotable)}`,
  );

  // ---- the records must exist, be parseable, and agree with the state ------------------------
  for (const [label, rel, expectedId] of [
    [
      "authorization",
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "DEC-0038",
    ],
    [
      "launch",
      "governance/DEC-0039-evaluation-attempt-4-launch.json",
      "DEC-0039",
    ],
    [
      "failure",
      "governance/DEC-0040-evaluation-attempt-4-failure.json",
      "DEC-0040",
    ],
  ]) {
    const rec = readJson(rel);
    check(
      `attempt-#4 ${label} record exists on disk and parses`,
      rec !== null,
      `missing or malformed: ${rel}`,
    );
    check(
      `attempt-#4 ${label} record identifies itself as ${expectedId}`,
      rec?.decisionId === expectedId,
      `decisionId=${JSON.stringify(rec?.decisionId)}`,
    );
  }
  const failureRec = readJson(
    "governance/DEC-0040-evaluation-attempt-4-failure.json",
  );
  check(
    "the failure record's own decisive comparison matches the state exactly",
    // The whole finding rests on this pair of OBSERVED strings. If either side drifts — e.g. the
    // failing side is quietly rewritten to the commit SHA, or the passing side loses its pin — the
    // "the same defect is not inherently fatal" conclusion stops being supported by evidence.
    failureRec?.decisiveComparison?.attempt4Fail?.resolvedRevision === "main" &&
      failureRec?.decisiveComparison?.attempt4Fail?.resolvedRevisionKind ===
        "MUTABLE_REF_NAME" &&
      failureRec?.decisiveComparison?.attempt4Fail?.loadOutcome === "FAIL" &&
      failureRec?.decisiveComparison?.dec0037Pass?.resolvedRevision ===
        "093fba6992ef5a7152481afec0bdfca1ac486998" &&
      failureRec?.decisiveComparison?.dec0037Pass?.resolvedRevisionKind ===
        "IMMUTABLE_COMMIT_SHA" &&
      failureRec?.decisiveComparison?.dec0037Pass?.loadOutcome === "PASS" &&
      failureRec?.failureLogSha256 === evalAuth.attempt4FailureLogSha256,
    `failRef=${JSON.stringify(failureRec?.decisiveComparison?.attempt4Fail?.resolvedRevision)} passRef=${JSON.stringify(failureRec?.decisiveComparison?.dec0037Pass?.resolvedRevision)}`,
  );
  check(
    "the failure record refuses to assert the unproven transport causation",
    typeof failureRec?.whatIsNotEstablished === "string" &&
      /UNPROVEN/.test(failureRec.whatIsNotEstablished) &&
      /CAUSED|fall back/i.test(failureRec.whatIsNotEstablished),
    "the record must carry what is NOT established, and name the unproven link explicitly",
  );
  check(
    "the failure record proves no inference from evidence and produced no predictions",
    failureRec?.testInferenceOccurred === false &&
      failureRec?.predictionsProduced?.predictionsBase === false &&
      failureRec?.predictionsProduced?.predictionsCandidate === false &&
      failureRec?.predictionsProduced?.runRecord === false &&
      failureRec?.testRecordsParsedLocally === 0 &&
      failureRec?.predictionsDownloaded === false &&
      failureRec?.scoringPerformed === false &&
      failureRec?.metricValuesProduced === 0 &&
      failureRec?.repairsPerformedByThisRecord === 0 &&
      failureRec?.kernelPushedByThisRecord === false &&
      failureRec?.fifthAttemptAuthorized === false &&
      failureRec?.furtherAttemptRequiresNewHumanDecision === true,
    `inference=${JSON.stringify(failureRec?.testInferenceOccurred)} runRecord=${JSON.stringify(failureRec?.predictionsProduced?.runRecord)} repairs=${JSON.stringify(failureRec?.repairsPerformedByThisRecord)}`,
  );
  check(
    "the failure record confirms nothing was promoted, tuned, selected, mutated, or created",
    failureRec?.promotionPerformed === false &&
      failureRec?.tuningPerformed === false &&
      failureRec?.selectionPerformed === false &&
      failureRec?.datasetMutated === false &&
      failureRec?.testDrivenCodeOptimisationPerformed === false &&
      failureRec?.ghariboV01Created === false,
    "no forbidden side-effect may be recorded as performed",
  );
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

// Final preflight reconciliation reads governance records only; never raw outputs or TEST.
const reconciliation = training.preflightReconciliation;
const reconciliationRecord = readJson("governance/DEC-0043-preflight-reconciliation.json");
check("final preflight reconciliation is registered", reconciliation?.decisionId === "DEC-0043" &&
  reconciliation?.record === "governance/DEC-0043-preflight-reconciliation.json" &&
  state.decisions?.some(d => d.id === "DEC-0043" && d.status === "ACCEPTED") &&
  reconciliationRecord?.decisionId === "DEC-0043");
if (reconciliationRecord) {
  const r = reconciliationRecord;
  const { reconciliationHash, ...body } = r;
  const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
  check("reconciliation hash binds the complete record and master state",
    reconciliationHash === createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex") &&
    reconciliation?.reconciliationHash === reconciliationHash);
  check("technical acceptance and governance noncompliance remain distinct",
    r.technicalResult === "LOCAL_SNAPSHOT_LOADER_EXECUTION_PROVEN" && r.loaderExecutionProven === true &&
    r.governanceCompliance === "NON_COMPLIANT" && r.deviation === "TWO_PUSHES_UNDER_ONE_PUSH_AUTHORIZATION" &&
    r.deviationClassification === "POST_EXECUTION_GOVERNANCE_DEVIATION");
  check("push accounting preserves one authorized, two actual, one excess",
    r.authorizedPushes === 1 && r.actualPushes === 2 && r.excessPushes === 1 && r.remainingAuthorizedPushes === 0 &&
    r.actualPushes - r.authorizedPushes === r.excessPushes);
  check("master state preserves DEC-0043 truth while DEC-0044/0045 advance attempt #5 lifecycle",
    ["technicalResult", "loaderExecutionProven", "governanceCompliance", "deviation", "authorizedPushes",
      "actualPushes", "excessPushes", "remainingAuthorizedPushes", "retroactiveAuthorization", "kernelId",
      "testAttached", "testAccessed", "inferenceExecuted", "evaluationStatus", "candidateStatus",
      "ghariboV01Status"].every(k => reconciliation?.[k] === r[k]) &&
    r.attempt5Authorized === false &&
    r.next === "HUMAN_DECISION_ON_ATTEMPT_5" &&
    reconciliation?.attempt5Authorized === true &&
    reconciliation?.attempt5AuthorizationDecisionId === "DEC-0044" &&
    reconciliation?.attempt5Outcome === "FAILED_PRE_INFERENCE" &&
    reconciliation?.attempt5OutcomeDecisionId === "DEC-0045" &&
    reconciliation?.next === "ATTEMPT_5_FAILED_PRE_INFERENCE_AWAITING_HUMAN_DECISION");
  const [v2, v3] = r.executions ?? [];
  check("both final-preflight pushes and their distinct outcomes survive",
    r.executions?.length === 2 && v2?.pushNumber === 1 && v2?.kernelVersion === 2 &&
    v2?.pushReportedSuccess === true && v2?.outcome === "STALE_NOTEBOOK_CONTENT_EXECUTED" &&
    v2?.intendedCorrectedArchitectureExercised === false && v3?.pushNumber === 2 && v3?.kernelVersion === 3 &&
    v3?.kernelStatus === "COMPLETE" && v3?.outcome === r.technicalResult &&
    v3?.exceedsAuthorization === true && v3?.retroactivelyAuthorized === false &&
    [v2, v3].every(v => v?.kernelId === r.kernelId && v?.testAttached === false && v?.testAccessed === false && v?.inferenceExecuted === false));
  const requiredMarkers = ["SNAPSHOT_PASS", "LOCAL_PATH_PASS", "TOKENIZER_PASS", "MODEL_LOAD_PASS",
    "DISTRIBUTION_REVISION_PASS", "NO_MUTABLE_MAIN", "TEST_ACCESS_NO", "INFERENCE_NO", "COMPLETE"];
  check("v3 success markers and immutable local loader identity are preserved",
    requiredMarkers.every(m => v3?.markersVerified?.includes(`PREFLIGHT3_${m}`)) &&
    v3?.observedDistributionRevision === "093fba6992ef5a7152481afec0bdfca1ac486998" &&
    v3?.actualLoaderInput === v3?.snapshotDirectory && v3?.snapshotDirectory?.startsWith("/") &&
    v3?.snapshotDirectory?.endsWith("/" + v3?.observedDistributionRevision) &&
    v3?.mutableMainResolutionDuringGovernedLoad === false && v3?.correctedContentVerifiedBeforeExecution === true &&
    [v3?.notebookSha256, v3?.pulledNotebookSha256, v3?.normalizedCellContentSha256, v3?.logSha256].every(isSha256) &&
    reconciliation?.version3LogSha256 === v3?.logSha256 &&
    r.evidence?.length === 4 && r.evidence.every(e => isSha256(e.sha256) && e.committed === false));
  const previous = readJson("governance/DEC-0042-preflight-authorization.json");
  check("the earlier DEC-0042 diagnostic block is preserved as history",
    previous?.execution?.status === "BLOCKED" && previous?.execution?.failureException === "ImportError" &&
    previous?.execution?.modelLoad === false && r.previousPreflight?.authorizationHash === previous?.authorizationHash &&
    training.preflightAuthorization?.decisionId === "DEC-0042" && training.preflightAuthorization?.execution?.status === "BLOCKED");
  check("reconciliation neither retroactively authorizes nor opens another execution",
    ["retroactiveAuthorization", "retryAuthorized", "automaticRetryAuthorized", "attempt5Authorized",
      "evaluationAuthorized", "newKernelPushAuthorized"].every(k => r[k] === false) &&
    r.next === "HUMAN_DECISION_ON_ATTEMPT_5");
  check("preflight reconciliation preserves all contamination and promotion boundaries",
    ["testAttached", "testAccessed", "inferenceExecuted", "evaluationExecuted", "tuningPerformed",
      "checkpointSelectionPerformed", "scoringPerformed", "promotionPerformed"].every(k => r[k] === false) &&
    r.evaluationStatus === "NOT_RUN" && r.evaluationResults === 0 && r.metricValuesProduced === 0 &&
    Object.keys(r.metrics ?? {}).length === 13 && Array.from({length: 13}, (_, i) => `M${i + 1}`).every(k => r.metrics?.[k] === null) &&
    r.candidateStatus === "EXPERIMENTAL_UNPROMOTED" && r.ghariboV01Status === "NOT_CREATED");
}

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
