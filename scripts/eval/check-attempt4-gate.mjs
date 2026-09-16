#!/usr/bin/env node
/**
 * Adversarial injection harness for scripts/eval/verify-evaluation-state.mjs
 *
 * A gate that cannot be observed to FAIL is not a gate. This script re-introduces, one at a time,
 * every defect the attempt-#4 verifier claims to catch, and asserts the verifier rejects each one.
 * Any injection that survives is printed as a GATE HOLE.
 *
 * Every mutation is reverted in a `finally` block, and the originals are rewritten at the end.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const MS = "governance/GHARIBO_MASTER_STATE.json";
const DEC38 = "governance/DEC-0038-evaluation-attempt-4-authorization.json";
const DEC39 = "governance/DEC-0039-evaluation-attempt-4-launch.json";
const DEC40 = "governance/DEC-0040-evaluation-attempt-4-failure.json";
const LEAK = "governance/EVALUATION-LEAKAGE-AUDIT.json";

const ORIG = new Map();
for (const p of [MS, DEC38, DEC39, DEC40, LEAK]) ORIG.set(p, readFileSync(p, "utf8"));

const EA = (s) => s.training.evaluationAuthorization;

/** Mutations applied to the MASTER STATE. */
const stateInjections = [
  ["attempt4TestInferenceOccurred -> true", (s) => { EA(s).attempt4TestInferenceOccurred = true; }],
  ["attempt4MetricValuesProduced -> 1", (s) => { EA(s).attempt4MetricValuesProduced = 1; }],
  ["attempt4Pushed -> false", (s) => { EA(s).attempt4Pushed = false; }],
  ["attempt4KernelPushesRemaining -> 1", (s) => { EA(s).attempt4KernelPushesRemaining = 1; }],
  ["attempt4KernelPushesPerformed -> 0", (s) => { EA(s).attempt4KernelPushesPerformed = 0; }],
  ["attempt4RetryAuthorized -> true", (s) => { EA(s).attempt4RetryAuthorized = true; }],
  ["attempt4RepairPerformed -> true", (s) => { EA(s).attempt4RepairPerformed = true; }],
  ["attempt4RetriesPerformed -> 1", (s) => { EA(s).attempt4RetriesPerformed = 1; }],
  ["attempt4FifthAttemptAuthorized -> true", (s) => { EA(s).attempt4FifthAttemptAuthorized = true; }],
  ["attempt4FurtherAttemptRequiresNewDecision -> false", (s) => { EA(s).attempt4FurtherAttemptRequiresNewDecision = false; }],
  ["harnessRepairLoopHalted -> false", (s) => { EA(s).harnessRepairLoopHalted = false; }],
  ["furtherAttemptAuthorized -> true", (s) => { EA(s).furtherAttemptAuthorized = true; }],
  ["attempt4AutomaticRetryAuthorized -> true", (s) => { EA(s).attempt4AutomaticRetryAuthorized = true; }],
  ["attempt4Status -> COMPLETED", (s) => { EA(s).attempt4Status = "COMPLETED"; }],
  ["attempt4Outcome -> SUCCEEDED", (s) => { EA(s).attempt4Outcome = "SUCCEEDED"; }],
  ["attempt4ModelObjectConstructed -> true", (s) => { EA(s).attempt4ModelObjectConstructed = true; }],
  ["attempt4PredictionFilesProduced -> 1", (s) => { EA(s).attempt4PredictionFilesProduced = 1; }],
  ["scoringPerformed -> true", (s) => { EA(s).scoringPerformed = true; }],
  ["predictionsDownloaded -> true", (s) => { EA(s).predictionsDownloaded = true; }],
  ["attempt4TransportCausationStatus -> PROVEN_CAUSED", (s) => { EA(s).attempt4TransportCausationStatus = "PROVEN_CAUSED"; }],
  ["attempt4SameDefectIsNotInherentlyFatal -> false", (s) => { EA(s).attempt4SameDefectIsNotInherentlyFatal = false; }],
  ["attempt4ResolvedRevisionObserved main -> commit SHA", (s) => { EA(s).attempt4ResolvedRevisionObserved = "093fba6992ef5a7152481afec0bdfca1ac486998"; }],
  ["attempt4ResolvedRevisionKind -> IMMUTABLE_COMMIT_SHA", (s) => { EA(s).attempt4ResolvedRevisionKind = "IMMUTABLE_COMMIT_SHA"; }],
  ["attempt4ContrastOutcome PASS -> FAIL", (s) => { EA(s).attempt4ContrastOutcome = "FAIL"; }],
  ["attempt4ContrastResolvedRevision -> main", (s) => { EA(s).attempt4ContrastResolvedRevision = "main"; }],
  ["attempt4RemediesIdentifiedNotApplied -> false", (s) => { EA(s).attempt4RemediesIdentifiedNotApplied = false; }],
  ["attempt4FailureEvidenceResult -> PASSED_4_OF_4 (no PRE_INFERENCE)", (s) => { EA(s).attempt4FailureEvidenceResult = "PASSED_4_OF_4"; }],
  ["attempt4FailureEvidenceScript -> removed", (s) => { EA(s).attempt4FailureEvidenceScript = ""; }],
  ["attempt4FailureLogSha256 -> truncated", (s) => { EA(s).attempt4FailureLogSha256 = "19956c53d2239d71"; }],
  ["attempt4FailureHash -> truncated", (s) => { EA(s).attempt4FailureHash = "10a44b694543ffd8"; }],
  ["attempt4LaunchHash -> truncated", (s) => { EA(s).attempt4LaunchHash = "a953c7cf147b705d"; }],
  ["attempt4AuthorizationHash -> truncated", (s) => { EA(s).attempt4AuthorizationHash = "8c26aadb0cbca63e"; }],
  ["attempt4NotebookSha256AsPushed -> truncated", (s) => { EA(s).attempt4NotebookSha256AsPushed = "a494c7b4"; }],
  ["attempt4LaunchBundleHashAsPushed -> truncated", (s) => { EA(s).attempt4LaunchBundleHashAsPushed = "5c09fbf6"; }],
  ["attempt4AuthorizationState -> UNSPENT", (s) => { EA(s).attempt4AuthorizationState = "UNSPENT"; }],
  ["attempt4MaximumKernelPushes -> 2", (s) => { EA(s).attempt4MaximumKernelPushes = 2; }],
  ["attempt4ArmOrder -> CANDIDATE_THEN_BASE", (s) => { EA(s).attempt4ArmOrder = "CANDIDATE_THEN_BASE"; }],
  ["attempt4Arms -> candidate only", (s) => { EA(s).attempt4Arms = ["candidate"]; }],
  ["attempt4SameTestRecordsForBothArms -> false", (s) => { EA(s).attempt4SameTestRecordsForBothArms = false; }],
  ["attempt4TestRecordCount -> 79", (s) => { EA(s).attempt4TestRecordCount = 79; }],
  ["attempt4TestSplitHash -> zeroed", (s) => { EA(s).attempt4TestSplitHash = "0".repeat(64); }],
  ["attempt4DecodingIdenticalAcrossArms -> false", (s) => { EA(s).attempt4DecodingIdenticalAcrossArms = false; }],
  ["attempt4CandidateSettingsNotAlteredAfterBaseOutput -> false", (s) => { EA(s).attempt4CandidateSettingsNotAlteredAfterBaseOutput = false; }],
  ["attempt4TuningAuthorized -> true", (s) => { EA(s).attempt4TuningAuthorized = true; }],
  ["attempt4ModelSelectionAuthorized -> true", (s) => { EA(s).attempt4ModelSelectionAuthorized = true; }],
  ["attempt4PromotionAuthorized -> true", (s) => { EA(s).attempt4PromotionAuthorized = true; }],
  ["attempt4GhariboV01CreationAuthorized -> true", (s) => { EA(s).attempt4GhariboV01CreationAuthorized = true; }],
  ["attempt4DatasetMutationAuthorized -> true", (s) => { EA(s).attempt4DatasetMutationAuthorized = true; }],
  ["attempt4TestDrivenCodeOptimisationAuthorized -> true", (s) => { EA(s).attempt4TestDrivenCodeOptimisationAuthorized = true; }],
  ["attempt4RedesignForbidden -> false", (s) => { EA(s).attempt4RedesignForbidden = false; }],
  ["attempt4LoaderConventionProvenBy DEC-0037 -> DEC-0032", (s) => { EA(s).attempt4LoaderConventionProvenBy = "DEC-0032"; }],
  ["attempt4AdditionalChatTemplates404Status -> FATAL", (s) => { EA(s).attempt4AdditionalChatTemplates404Status = "FATAL"; }],
  ["attempt4AuthorizationSpentOnInferenceStart -> false", (s) => { EA(s).attempt4AuthorizationSpentOnInferenceStart = false; }],
  ["attempt4OnPreInferenceFailure -> 'Diagnose and retry.'", (s) => { EA(s).attempt4OnPreInferenceFailure = "Diagnose and retry."; }],
  ["attempt4Number -> 5", (s) => { EA(s).attempt4Number = 5; }],
  ["attempt4AuthorizationStatus -> DRAFT", (s) => { EA(s).attempt4AuthorizationStatus = "DRAFT"; }],
  ["attempt4FailurePhase MODEL_LOAD -> INSTALL", (s) => { EA(s).attempt4FailurePhase = "INSTALL"; }],
  ["attempt4FailureDefectId DEF-0040-A -> DEF-0040-B", (s) => { EA(s).attempt4FailureDefectId = "DEF-0040-B"; }],
  ["attempt4FailureClass -> INFRASTRUCTURE", (s) => { EA(s).attempt4FailureClass = "INFRASTRUCTURE"; }],
  ["attempt4AuthorizationDecisionId DEC-0038 -> DEC-0039", (s) => { EA(s).attempt4AuthorizationDecisionId = "DEC-0039"; }],
  ["attempt4LaunchDecisionId DEC-0039 -> DEC-0038", (s) => { EA(s).attempt4LaunchDecisionId = "DEC-0038"; }],
  ["attempt4FailureDecisionId DEC-0040 -> DEC-0039", (s) => { EA(s).attempt4FailureDecisionId = "DEC-0039"; }],
  ["attempt4KernelId -> someone/else", (s) => { EA(s).attempt4KernelId = "someone/else"; }],
  ["attempt4KernelVersion -> 2", (s) => { EA(s).attempt4KernelVersion = 2; }],
  ["attempt4KernelStatusAtRecordTime -> COMPLETE", (s) => { EA(s).attempt4KernelStatusAtRecordTime = "COMPLETE"; }],
  ["testRecordsParsed -> 5", (s) => { EA(s).testRecordsParsed = 5; }],
  ["testRecordsParsedLocally -> 5", (s) => { EA(s).testRecordsParsedLocally = 5; }],
  ["executionSucceeded -> true", (s) => { EA(s).executionSucceeded = true; }],
  ["evaluationStatus -> COMPLETED", (s) => { EA(s).evaluationStatus = "COMPLETED"; }],
  ["evaluationResults -> 1", (s) => { EA(s).evaluationResults = 1; }],
  ["experiment.promotable -> true", (s) => { s.experiments["GHARIBO-exp-001"].promotable = true; }],
  ["experiment.evaluationStatus -> COMPLETED", (s) => { s.experiments["GHARIBO-exp-001"].evaluationStatus = "COMPLETED"; }],
  ["training.evaluationResults -> 1", (s) => { s.training.evaluationResults = 1; }],
  ["DEC-0038 supersededBy set", (s) => { s.decisions.find((d) => d.id === "DEC-0038").supersededBy = "DEC-0099"; }],
  ["DEC-0038 status -> SUPERSEDED", (s) => { s.decisions.find((d) => d.id === "DEC-0038").status = "SUPERSEDED"; }],
  ["DEC-0038 duplicated", (s) => { s.decisions.push(JSON.parse(JSON.stringify(s.decisions.find((d) => d.id === "DEC-0038")))); }],
  ["DEC-0039 removed from ledger", (s) => { s.decisions = s.decisions.filter((d) => d.id !== "DEC-0039"); }],
  ["DEC-0040 status -> SUPERSEDED", (s) => { s.decisions.find((d) => d.id === "DEC-0040").status = "SUPERSEDED"; }],
  ["GHARIBO-V0.1 -> CREATED", (s) => { s.models.derivedModels.find((m) => m.id === "GHARIBO-V0.1").status = "CREATED"; }],
  ["training.status -> IN_PROGRESS", (s) => { s.training.status = "IN_PROGRESS"; }],
  ["thirdLaunch failure record erased", (s) => { EA(s).thirdLaunchOutcome = null; }],
  ["launchAttempts floored below escalation", (s) => { EA(s).launchAttempts = 2; }],
  ["defectClassesFound floored below escalation", (s) => { EA(s).defectClassesFound = 4; }],
  ["authorizationSpent -> true without inference", (s) => { EA(s).authorizationSpent = true; }],
];

/** Mutations applied to the DEC-0040 failure RECORD. */
const recordInjections = [
  [DEC40, "DEC-0040 predictionsProduced.predictionsBase -> true", (r) => { r.predictionsProduced.predictionsBase = true; }],
  [DEC40, "DEC-0040 predictionsProduced.predictionsCandidate -> true", (r) => { r.predictionsProduced.predictionsCandidate = true; }],
  [DEC40, "DEC-0040 predictionsProduced.runRecord -> true", (r) => { r.predictionsProduced.runRecord = true; }],
  [DEC40, "DEC-0040 testInferenceOccurred -> true", (r) => { r.testInferenceOccurred = true; }],
  [DEC40, "DEC-0040 repairsPerformedByThisRecord -> 1", (r) => { r.repairsPerformedByThisRecord = 1; }],
  [DEC40, "DEC-0040 kernelPushedByThisRecord -> true", (r) => { r.kernelPushedByThisRecord = true; }],
  [DEC40, "DEC-0040 fifthAttemptAuthorized -> true", (r) => { r.fifthAttemptAuthorized = true; }],
  [DEC40, "DEC-0040 furtherAttemptRequiresNewHumanDecision -> false", (r) => { r.furtherAttemptRequiresNewHumanDecision = false; }],
  [DEC40, "DEC-0040 metricValuesProduced -> 1", (r) => { r.metricValuesProduced = 1; }],
  [DEC40, "DEC-0040 scoringPerformed -> true", (r) => { r.scoringPerformed = true; }],
  [DEC40, "DEC-0040 testRecordsParsedLocally -> 5", (r) => { r.testRecordsParsedLocally = 5; }],
  [DEC40, "DEC-0040 predictionsDownloaded -> true", (r) => { r.predictionsDownloaded = true; }],
  [DEC40, "DEC-0040 attempt4Fail.resolvedRevision rewritten to the commit SHA", (r) => { r.decisiveComparison.attempt4Fail.resolvedRevision = "093fba6992ef5a7152481afec0bdfca1ac486998"; }],
  [DEC40, "DEC-0040 attempt4Fail.resolvedRevisionKind -> IMMUTABLE_COMMIT_SHA", (r) => { r.decisiveComparison.attempt4Fail.resolvedRevisionKind = "IMMUTABLE_COMMIT_SHA"; }],
  [DEC40, "DEC-0040 attempt4Fail.loadOutcome -> PASS", (r) => { r.decisiveComparison.attempt4Fail.loadOutcome = "PASS"; }],
  [DEC40, "DEC-0040 dec0037Pass.resolvedRevision unpinned", (r) => { r.decisiveComparison.dec0037Pass.resolvedRevision = "main"; }],
  [DEC40, "DEC-0040 dec0037Pass.loadOutcome -> FAIL", (r) => { r.decisiveComparison.dec0037Pass.loadOutcome = "FAIL"; }],
  [DEC40, "DEC-0040 failureLogSha256 -> zeroed", (r) => { r.failureLogSha256 = "0".repeat(64); }],
  [DEC40, "DEC-0040 whatIsNotEstablished stripped of UNPROVEN", (r) => { r.whatIsNotEstablished = "Nothing is uncertain."; }],
  [DEC40, "DEC-0040 promotionPerformed -> true", (r) => { r.promotionPerformed = true; }],
  [DEC40, "DEC-0040 ghariboV01Created -> true", (r) => { r.ghariboV01Created = true; }],
  [DEC40, "DEC-0040 datasetMutated -> true", (r) => { r.datasetMutated = true; }],
  [DEC40, "DEC-0040 tuningPerformed -> true", (r) => { r.tuningPerformed = true; }],
  [DEC40, "DEC-0040 selectionPerformed -> true", (r) => { r.selectionPerformed = true; }],
  [DEC40, "DEC-0040 testDrivenCodeOptimisationPerformed -> true", (r) => { r.testDrivenCodeOptimisationPerformed = true; }],
  [DEC40, "DEC-0040 decisionId rewired to DEC-0039", (r) => { r.decisionId = "DEC-0039"; }],
  [DEC38, "DEC-0038 decisionId rewired to DEC-0037", (r) => { r.decisionId = "DEC-0037"; }],
  [DEC39, "DEC-0039 decisionId rewired to DEC-0038", (r) => { r.decisionId = "DEC-0038"; }],
  [LEAK, "leakage audit status -> FAIL", (r) => { r.status = "FAIL"; }],
  [LEAK, "leakage audit testAudited -> 1", (r) => { r.auditCohort.testAudited = 1; }],
  [LEAK, "leakage audit kind -> CONTENT_INSPECTED", (r) => { r.kind = "CONTENT_INSPECTED"; }],
];

const runVerifier = () => {
  try {
    const out = execFileSync(process.execPath, ["scripts/eval/verify-evaluation-state.mjs"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { failed: /FAILED/.test(out), out };
  } catch (e) {
    return { failed: true, out: (e.stdout || "") + (e.stderr || "") };
  }
};

const writeRetry = (p, v) => {
  for (let i = 0; i < 40; i++) {
    try {
      writeFileSync(p, v);
      return;
    } catch (e) {
      if (i === 39) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 75);
    }
  }
};

const restore = () => { for (const [p, v] of ORIG) writeRetry(p, v); };

const applied = [];
const survived = [];
let rejected = 0;

try {
  for (const [name, mut] of stateInjections) {
    restore();
    const s = JSON.parse(ORIG.get(MS));
    mut(s);
    writeRetry(MS, JSON.stringify(s, null, 2) + "\n");
    applied.push(name);
    if (runVerifier().failed) rejected++;
    else survived.push(name);
  }
  for (const [path, name, mut] of recordInjections) {
    restore();
    const r = JSON.parse(ORIG.get(path));
    mut(r);
    writeRetry(path, JSON.stringify(r, null, 2) + "\n");
    if (runVerifier().failed) rejected++;
    else survived.push(`${name}  [${path}]`);
  }
} finally {
  restore();
}

// The restored tree must itself be clean, or every rejection above is meaningless.
const baseline = runVerifier();

const total = stateInjections.length + recordInjections.length;
console.log("════════════════════════════════════════════════════════════════");
console.log("GHARIBO — adversarial injection suite (attempt #4 evaluator)");
console.log("════════════════════════════════════════════════════════════════");
console.log(`  injections applied : ${total}`);
console.log(`  rejected (good)    : ${rejected}`);
console.log(`  SURVIVED (holes)   : ${survived.length}`);
if (survived.length) {
  console.log("  ---- GATE HOLES ----");
  for (const s of survived) console.log(`  !! ${s}`);
}
console.log("════════════════════════════════════════════════════════════════");
console.log(
  baseline.failed
    ? "  BASELINE AFTER RESTORE: FAILED — the harness itself is broken; rerun on a clean tree."
    : "  BASELINE AFTER RESTORE: PASSED — every rejection above was caused by its injection.",
);
console.log("════════════════════════════════════════════════════════════════");
process.exit(survived.length === 0 && !baseline.failed ? 0 : 1);
