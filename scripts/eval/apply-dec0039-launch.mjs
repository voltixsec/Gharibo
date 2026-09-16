#!/usr/bin/env node
/**
 * apply-dec0039-launch.mjs — idempotent master-state patcher for the DEC-0039 launch record.
 *
 * Records that attempt #4 was PUSHED, under DEC-0038's ONE-push bound, and that zero pushes remain.
 * It moves the attempt from AUTHORIZED_NOT_YET_PUSHED to IN_FLIGHT and does NOT claim any result.
 *
 * Usage: node scripts/eval/apply-dec0039-launch.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { launchHash } from "./build-dec0039-launch.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASTER_REL = "governance/GHARIBO_MASTER_STATE.json";
const MASTER = resolve(ROOT, MASTER_REL);

const LAUNCH_HASH = launchHash();
const state = JSON.parse(readFileSync(MASTER, "utf8"));

const DEC0039_TEXT =
  "Evaluation attempt #4 was LAUNCHED. Exactly ONE kernel push was performed under DEC-0038's " +
  "ONE-push bound - kernel vokaigharibo/gharibo-eval-001-fec22ca2, observed RUNNING immediately " +
  "after the push - and ZERO pushes remain. The pushed artifact is pinned by the notebook sha256 " +
  "a494c7b40229a8b79698daf372834d6ac73cc9243ca92a251281c71c76c7536d and the launch bundle hash " +
  "5c09fbf6796364fa6610a49ff248fe926ade219e099328343e3a48dc74c43096, after 19 bundle checks and " +
  "57 kernel safety checks passed. The run covers the BASE arm then the CANDIDATE arm over the same " +
  "80 held-out TEST records with decoding identical across arms (temperature 0.0, do_sample false, " +
  "top_p 1.0, top_k 0, max_new_tokens 1024, seed 0, repeats 1), scored under " +
  "gharibo-eval-harness-1.0.0, carrying prompts only. The DEC-0037 proven loading path was reused " +
  "unchanged and was NOT redesigned: FastLanguageModel.from_pretrained with 'unsloth/gpt-oss-20b', " +
  "dtype=None, load_in_4bit=True and no revision= argument. This record is a LAUNCH, not a result: " +
  "M1-M13 remain null, testRecordsParsedLocally is 0, predictionsDownloaded and scoringPerformed " +
  "are false, evaluationResults is 0 and evaluationStatus is NOT_RUN. Whether TEST inference " +
  "materially occurs is recorded as IN_FLIGHT_NOT_YET_ESTABLISHED and is deliberately not claimed. " +
  "Under DEC-0038, if inference begins the authorization is SPENT and the run is never repeated for " +
  "a poor result; if it dies pre-inference the failure is proven from logs and markers, recorded, " +
  "and STOPPED without repair. No tuning, selection, promotion or GHARIBO-V0.1 creation is " +
  "performed or authorized.";

const DEC0039_RATIONALE =
  "Authorization and execution are recorded separately on purpose. DEC-0038 says what was permitted; " +
  "this record says what was done, and pins the exact bytes that were pushed. Collapsing the two " +
  "would make it impossible to distinguish a permission that was never exercised from a run that " +
  "actually happened, and the whole escalation history of this project has been a lesson in how " +
  "easily a record can imply more than it did. The push count is the load-bearing field: DEC-0038 " +
  "authorized one, one was performed, and zero remain. That zero is what makes a repair-and-retry " +
  "impossible without a further human decision, and it is recorded here rather than left to be " +
  "inferred. Nothing about the outcome is stated, because nothing about the outcome is known: the " +
  "kernel is running, and a launch that described its own result would be the exact failure mode " +
  "three previous launches were recorded to avoid.";

if (!state.decisions.some((d) => d.id === "DEC-0039")) {
  state.decisions.push({
    id: "DEC-0039",
    date: "2026-09-16",
    title: "Launch evaluation attempt #4: one kernel push under DEC-0038, zero pushes remaining",
    status: "ACCEPTED",
    decision: DEC0039_TEXT,
    rationale: DEC0039_RATIONALE,
    scope: ["training", "experiments", "models", "integrations"],
    references: [
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/DEC-0039-evaluation-attempt-4-launch.json",
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });
}

{
  const d = state.decisions.find((x) => x.id === "DEC-0039");
  if (d) {
    d.title = "Launch evaluation attempt #4: one kernel push under DEC-0038, zero pushes remaining";
    d.decision = DEC0039_TEXT;
    d.rationale = DEC0039_RATIONALE;
  }
}

for (const id of ["DEC-0038", "DEC-0039"]) {
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
  ea.attempt4LaunchDecisionId = "DEC-0039";
  ea.attempt4LaunchHash = LAUNCH_HASH;
  ea.attempt4LaunchRecord = "governance/DEC-0039-evaluation-attempt-4-launch.json";
  ea.attempt4Status = "IN_FLIGHT";
  ea.attempt4Pushed = true;
  ea.attempt4KernelPushesPerformed = 1;
  ea.attempt4KernelPushesRemaining = 0;
  ea.attempt4KernelId = "vokaigharibo/gharibo-eval-001-fec22ca2";
  ea.attempt4KernelVersion = 3;
  ea.attempt4KernelStatusAtRecordTime = "RUNNING";
  ea.attempt4NotebookSha256AsPushed = "a494c7b40229a8b79698daf372834d6ac73cc9243ca92a251281c71c76c7536d";
  ea.attempt4LaunchBundleHashAsPushed = "5c09fbf6796364fa6610a49ff248fe926ade219e099328343e3a48dc74c43096";
  ea.attempt4TestInferenceOccurred = "IN_FLIGHT_NOT_YET_ESTABLISHED";
  ea.attempt4MetricValuesProduced = 0;
  ea.attempt4RetryAuthorized = false;

  // The single authorized execution is now committed and no further push remains.
  ea.launchAttempts = 4;
  ea.activeKernelId = "vokaigharibo/gharibo-eval-001-fec22ca2";
  ea.activeKernelVersion = 3;
  ea.activeKernelStatusAtRecordTime = "RUNNING";
  ea.authorizationSpent = false;
  ea.hardStops2Satisfied = false;
  ea.hardStops3Satisfied = true;
  ea.metricValuesProduced = 0;
  ea.predictionsDownloaded = false;
  ea.scoringPerformed = false;
  ea.evaluationStatus = "NOT_RUN";
  ea.evaluationResults = 0;
  ea.harnessRepairLoopHalted = true;
  ea.furtherAttemptAuthorized = false;
  ea.furtherAttemptRequiresNewDecision = true;

  ea.note =
    "Attempt #4 is IN FLIGHT: ONE push performed, ZERO remaining. The run uses the DEC-0037 proven " +
    "loading path unchanged, BASE then CANDIDATE over the same 80 held-out TEST records, decoding " +
    "identical across arms. No metric value exists yet and none is estimated - M1-M13 are null and " +
    "evaluationResults is 0 until real predictions are retrieved and scored locally against " +
    "held-out gold. If TEST inference begins the authorization is SPENT and the run is never " +
    "repeated for a poor result; if it dies pre-inference the failure is proven, recorded and " +
    "STOPPED without repair. Training stays COMPLETED, the adapter stays EXPERIMENTAL and " +
    "unpromoted, and GHARIBO-V0.1 stays NOT_CREATED.";
}

if (state.currentState) {
  state.currentState.blockerSummary = {
    openBlockers: 0,
    closedBlockers: (state.blockers ?? []).filter((b) => b.status === "CLOSED").length,
    blockingNow:
      "None. Attempt #4 of the governed held-out TEST benchmark is IN FLIGHT: one kernel push was " +
      "performed under DEC-0038's ONE-push bound and zero pushes remain. What remains is execution " +
      "time and, if it succeeds, a LOCAL scoring pass against held-out gold.",
    note:
      "A launch is not a result. The kernel is running and no metric value exists. M1-M13 stay null " +
      "until real predictions are retrieved and scored.",
  };
}

const act = (state.nextActions ?? []).find((a) => a.id === "ACT-0001");
if (act) {
  act.status = "IN_FLIGHT_AWAITING_RUN_COMPLETION";
  act.note =
    "Attempt #4 was pushed under DEC-0038 (one push, zero remaining). Next: await completion, " +
    "retrieve predictions if both arms completed, score locally against held-out gold, and register " +
    "REAL M1-M13. A pre-inference failure is proven, recorded and STOPPED rather than repaired. " +
    "Promotion remains a SEPARATE decision.";
}

state.masterStateVersion = "1.19.0";

writeFileSync(MASTER, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log(`patched ${MASTER_REL}`);
console.log(`  decisions         : ${state.decisions.length} (latest DEC-0039)`);
console.log(`  masterStateVersion: ${state.masterStateVersion}`);
console.log(`  launchHash        : ${LAUNCH_HASH}`);
console.log(`  attempt4Status    : ${ea ? ea.attempt4Status : "(none)"}`);
console.log(`  pushesRemaining   : ${ea ? ea.attempt4KernelPushesRemaining : "(none)"}`);
console.log(`  kernelVersion     : ${ea ? ea.attempt4KernelVersion : "(none)"}`);
