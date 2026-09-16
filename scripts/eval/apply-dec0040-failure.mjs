#!/usr/bin/env node
/**
 * apply-dec0040-failure.mjs — idempotent master-state patcher for the attempt-#4 failure record.
 *
 * Records the pre-inference failure, the decisive revision observation, the exhausted attempt bound,
 * and the HALT. It claims no result.
 *
 * Usage: node scripts/eval/apply-dec0040-failure.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { failureHash } from "./build-dec0040-failure.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASTER_REL = "governance/GHARIBO_MASTER_STATE.json";
const MASTER = resolve(ROOT, MASTER_REL);

const FAILURE_HASH = failureHash();
const state = JSON.parse(readFileSync(MASTER, "utf8"));

const DEC0040_TEXT =
  "Evaluation attempt #4 FAILED PRE-INFERENCE and is recorded as a failure with no repair. The " +
  "kernel (vokaigharibo/gharibo-eval-001-fec22ca2 v3) reached the furthest point of any attempt - " +
  "pins loaded, base revision asserted against the live repo, 80 prompts loaded, all THREE governed " +
  "install stages completed, and FastLanguageModel.from_pretrained entered - and then died in cell " +
  "[6] inside the BASE load with RuntimeError from the Unsloth tokenizer/processor path. No TEST " +
  "inference occurred: eight inference markers were scanned and none is present, no prediction file " +
  "and no run record were produced, so ZERO measurements exist and M1-M13 remain null. DEFECT " +
  "DEF-0040-A: HTTPStatusError 404 on the distribution's additional_chat_templates directory, " +
  "raised from transformers/utils/hub.py::list_repo_templates -> HfApi.list_repo_tree and wrapped by " +
  "Unsloth into a fatal RuntimeError. THE DECISIVE FINDING IS THAT THIS 404 IS NOT INHERENTLY " +
  "FATAL: the identical 404 appeared in the DEC-0037 PASS and the tokenizer and BASE model loaded " +
  "successfully there. What differs is the revision the distribution resolved to. DEC-0037 printed " +
  "'additional_chat_templates does not exist on \"093fba6992ef5a7152481afec0bdfca1ac486998\"' - an " +
  "IMMUTABLE COMMIT SHA, load PASS. Attempt #4 printed 'additional_chat_templates does not exist on " +
  "\"main\"' - a MUTABLE REF NAME, load FAIL. It is therefore ESTABLISHED that at revision 'main' " +
  "the 404 is fatal and at the pinned SHA it is not. It is NOT established that the Xet transport " +
  "error which precedes the failure caused the fallback: the ordering is consistent with that but " +
  "does not prove it, so transport causation is recorded as UNPROVEN and is not asserted. The " +
  "plausible remedies (pin the distribution revision explicitly, force HF_HUB_DISABLE_XET=1, " +
  "pre-download and load locally, or re-scope the benchmark) are named and NONE is applied. The " +
  "attempt was bounded to ONE kernel push with zero retries; one push was performed and zero remain; " +
  "no retry was executed. The harness-repair loop stays HALTED and a fifth attempt requires a new " +
  "explicit human decision. Four attempts and six defect classes have produced ZERO metric values, " +
  "and three of the four died at MODEL_LOAD. Training stays COMPLETED, the adapter stays EXPERIMENTAL " +
  "and unpromoted, evaluation stays NOT_RUN with evaluationResults 0, and GHARIBO-V0.1 stays " +
  "NOT_CREATED.";

const DEC0040_RATIONALE =
  "The tempting move here is a one-line fix. Pin the distribution revision when loading and the " +
  "resolution cannot fall back from the commit SHA to the ref name; the counter-example is already " +
  "in hand from DEC-0037, so the change looks obvious and cheap. That is exactly why it must not be " +
  "made by the harness on its own authority. DEC-0036 halted the repair loop because three pushes " +
  "against a live accelerator quota had produced zero measurements, and the loop's defining failure " +
  "mode was that each fix was locally justified while the aggregate was a system quietly deciding " +
  "for itself how many failures are acceptable. DEC-0038 then bounded this attempt to one push and " +
  "zero retries precisely so that the bound, not the harness, would decide when to stop. The bound " +
  "has now been consumed. Separating the two questions is what this record is for: whether the " +
  "failure is fixable is a technical question the logs largely answer yes to, and whether to attempt " +
  "a fifth time is an authorization question that belongs to the CEO. Collapsing them would let a " +
  "correct diagnosis launder an unauthorized retry, which is the precise behaviour the last three " +
  "governance records were written to prevent. The honest reading of the pattern is also worth " +
  "stating: three of four attempts died at MODEL_LOAD and the last two died on the same 404, so the " +
  "convergent conclusion is that this free-tier runtime does not reproducibly load the distribution " +
  "for the governed run - not that a further fix is waiting to be discovered.";

if (!state.decisions.some((d) => d.id === "DEC-0040")) {
  state.decisions.push({
    id: "DEC-0040",
    date: "2026-09-16",
    title:
      "Record evaluation attempt #4 as a pre-inference failure, apply no repair, and halt pending a CEO decision",
    status: "ACCEPTED",
    decision: DEC0040_TEXT,
    rationale: DEC0040_RATIONALE,
    scope: ["training", "experiments", "models", "integrations"],
    references: [
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/DEC-0040-evaluation-attempt-4-failure.json",
      "governance/DEC-0039-evaluation-attempt-4-launch.json",
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "scripts/eval/verify-eval-failure-evidence.py",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });
}

{
  const d = state.decisions.find((x) => x.id === "DEC-0040");
  if (d) {
    d.title =
      "Record evaluation attempt #4 as a pre-inference failure, apply no repair, and halt pending a CEO decision";
    d.decision = DEC0040_TEXT;
    d.rationale = DEC0040_RATIONALE;
  }
}

for (const id of ["DEC-0038", "DEC-0039", "DEC-0040"]) {
  const d = state.decisions.find((x) => x.id === id);
  if (!d) continue;
  for (const ref of d.references ?? []) {
    if (!existsSync(resolve(ROOT, ref))) {
      console.error(`REFUSING TO WRITE: ${id} references a path that does not exist: ${ref}`);
      process.exit(1);
    }
  }
}

const ea = state.training.evaluationAuthorization;
if (ea) {
  ea.attempt4FailureDecisionId = "DEC-0040";
  ea.attempt4FailureHash = FAILURE_HASH;
  ea.attempt4FailureRecord = "governance/DEC-0040-evaluation-attempt-4-failure.json";
  ea.attempt4Status = "FAILED_PRE_INFERENCE";
  ea.attempt4Outcome = "FAILED_PRE_INFERENCE";
  ea.attempt4FailureClass = "HARNESS_DEFECT_NO_EXECUTION";
  ea.attempt4FailureDefectId = "DEF-0040-A";
  ea.attempt4FailurePhase = "MODEL_LOAD";
  ea.attempt4FailureCell = "In [6] (BASE model load)";
  ea.attempt4FailureException = "RuntimeError";
  ea.attempt4KernelStatusAtRecordTime = "ERROR";
  ea.attempt4TestInferenceOccurred = false;
  ea.attempt4ModelObjectConstructed = false;
  ea.attempt4PredictionFilesProduced = 0;
  ea.attempt4MetricValuesProduced = 0;

  // The decisive finding and its limit.
  ea.attempt4ResolvedRevisionObserved = "main";
  ea.attempt4ResolvedRevisionKind = "MUTABLE_REF_NAME";
  ea.attempt4ContrastResolvedRevision = "093fba6992ef5a7152481afec0bdfca1ac486998";
  ea.attempt4ContrastResolvedRevisionKind = "IMMUTABLE_COMMIT_SHA";
  ea.attempt4ContrastOutcome = "PASS";
  ea.attempt4SameDefectIsNotInherentlyFatal = true;
  ea.attempt4TransportCausationStatus = "UNPROVEN_NOT_ASSERTED";
  ea.attempt4RemediesIdentifiedNotApplied = true;

  ea.attempt4FailureLogSha256 =
    "19956c53d2239d71038c7753976cb521484c0f63871fe41e9560baf11c316e5b";
  ea.attempt4FailureEvidenceScript = "scripts/eval/verify-eval-failure-evidence.py";
  ea.attempt4FailureEvidenceResult = "PASSED_4_OF_4_PRE_INFERENCE";

  ea.attempt4AuthorizationState = "EXHAUSTED_ONE_PUSH_CONSUMED_ZERO_REMAINING";
  ea.attempt4KernelPushesRemaining = 0;
  ea.attempt4RetriesPerformed = 0;
  ea.attempt4RetryAuthorized = false;
  ea.attempt4FifthAttemptAuthorized = false;
  ea.attempt4FurtherAttemptRequiresNewDecision = true;
  ea.attempt4RepairPerformed = false;

  ea.launchAttempts = 4;
  ea.defectClassesFound = 6;
  ea.harnessRepairs = 2;
  ea.metricValuesProduced = 0;
  ea.predictionsDownloaded = false;
  ea.scoringPerformed = false;
  ea.evaluationStatus = "NOT_RUN";
  ea.evaluationResults = 0;
  ea.authorizationSpent = false;
  ea.hardStops2Satisfied = false;
  ea.hardStops3Satisfied = true;
  ea.harnessRepairLoopHalted = true;
  ea.furtherAttemptAuthorized = false;
  ea.furtherAttemptRequiresNewDecision = true;

  ea.note =
    "Attempt #4 FAILED PRE-INFERENCE and is recorded as a failure. ONE push was performed, ZERO " +
    "remain, and NO retry was executed: the attempt is EXHAUSTED. No TEST inference occurred (8 " +
    "markers scanned, none present), so no measurement exists - M1-M13 remain null and are never " +
    "written as 0, 'N/A', or an estimate. The decisive finding is that the 404 which killed the run " +
    "is NOT inherently fatal: DEC-0037 survived the identical 404 at the pinned commit SHA, while " +
    "attempt #4 hit it at the mutable ref 'main'. Whether the preceding Xet transport error caused " +
    "that fallback is UNPROVEN and is not asserted. Plausible remedies are identified and NONE is " +
    "applied; the harness-repair loop stays HALTED and a fifth attempt requires a new explicit human " +
    "decision. Training stays COMPLETED, the adapter stays EXPERIMENTAL and unpromoted, and " +
    "GHARIBO-V0.1 stays NOT_CREATED.";
}

if (state.currentState) {
  state.currentState.blockerSummary = {
    openBlockers: 0,
    closedBlockers: (state.blockers ?? []).filter((b) => b.status === "CLOSED").length,
    blockingNow:
      "None at the governance level, and the constraint is not a blocker but an EXHAUSTED " +
      "AUTHORIZATION plus a CEO decision. Attempt #4 failed pre-inference; its ONE permitted push " +
      "was used and zero remain; the harness-repair loop is HALTED. Four attempts and six defect " +
      "classes have produced zero measurements, and three of the four died at MODEL_LOAD.",
    note:
      "The question now on the table is not technical - the logs largely answer 'is it fixable' - but " +
      "authorizational: whether to attempt a fifth time, change the runtime, or conclude the " +
      "benchmark is not executable under the zero-cost mandate. M1-M13 remain null.",
  };
}

const act = (state.nextActions ?? []).find((a) => a.id === "ACT-0001");
if (act) {
  act.status = "BLOCKED_ON_HUMAN_DECISION";
  act.note =
    "Attempt #4 failed pre-inference; one push consumed, zero remaining, no retry executed. " +
    "DEC-0040 records the failure and halts. A fifth attempt requires a new explicit human decision " +
    "choosing between pinning the distribution revision, disabling Xet for the load, loading from a " +
    "pre-downloaded local path, or re-scoping the benchmark. Human evaluation of the measured " +
    "artifact remains blocked because no measurement exists.";
}

state.masterStateVersion = "1.20.0";

writeFileSync(MASTER, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log(`patched ${MASTER_REL}`);
console.log(`  decisions         : ${state.decisions.length} (latest DEC-0040)`);
console.log(`  masterStateVersion: ${state.masterStateVersion}`);
console.log(`  failureHash       : ${FAILURE_HASH}`);
console.log(`  attempt4Status    : ${ea ? ea.attempt4Status : "(none)"}`);
console.log(`  defect            : ${ea ? ea.attempt4FailureDefectId : "(none)"}`);
console.log(`  pushesRemaining   : ${ea ? ea.attempt4KernelPushesRemaining : "(none)"}`);
console.log(`  retriesPerformed  : ${ea ? ea.attempt4RetriesPerformed : "(none)"}`);
console.log(`  defectClasses     : ${ea ? ea.defectClassesFound : "(none)"}`);
