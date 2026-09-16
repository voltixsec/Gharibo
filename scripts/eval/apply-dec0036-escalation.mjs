#!/usr/bin/env node
/**
 * apply-dec0036-escalation.mjs — idempotent master-state patcher for the DEC-0036 escalation.
 *
 * What it does, in order:
 *   1. pushes DEC-0036 into the decision index if absent, and reconciles it if present;
 *   2. updates training.evaluationAuthorization to record the third failure and the escalation;
 *   3. rewrites currentState.blockerSummary;
 *   4. updates the active action;
 *   5. bumps masterStateVersion.
 *
 * Like apply-dec0034-0035.mjs, the reconcile step matters: a patcher that only ever pushes new
 * entries silently leaves already-present ones stale.
 *
 * Usage: node scripts/eval/apply-dec0036-escalation.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { escalationHash } from "./build-dec0036-escalation.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASTER_REL = "governance/GHARIBO_MASTER_STATE.json";
const MASTER = resolve(ROOT, MASTER_REL);

const ESCALATION_HASH = escalationHash();

const state = JSON.parse(readFileSync(MASTER, "utf8"));

const DEC0036_TEXT =
  "The third launch of the evaluation kernel FAILED pre-inference, and the harness-repair loop is " +
  "HALTED and escalated to the CEO rather than repaired a third time. The kernel reached further " +
  "than either previous attempt - pins loaded, 80 prompts loaded, all three governed install stages " +
  "completed, and the base model load was entered - and then died in cell 6 inside " +
  "Unsloth vision.py::from_pretrained with 'RuntimeError: Unsloth: Could not load the " +
  "tokenizer/processor'. The underlying hub response was HTTP 404 for " +
  "unsloth/gpt-oss-20b-unsloth-bnb-4bit/additional_chat_templates, surfacing as " +
  "RemoteEntryNotFoundError; a transient Xet transport warning precedes it, so whether the 404 is " +
  "hub-side or transport-induced is NOT established and is not asserted. This is a FIFTH distinct " +
  "defect class (DEF-0036-E) across THREE launches. No TEST inference occurred: eight inference " +
  "markers were scanned and none is present, and neither 'base loaded from' nor 'BASE loaded' " +
  "appears, so no model object was ever constructed. The single authorized execution therefore " +
  "remains technically unspent under hardStops[2] - but DEC-0035's own rule, that a third " +
  "pre-inference failure must be escalated because repeated harness failure is itself evidence " +
  "about the plan, is now triggered. No repair was performed, no kernel was pushed, and no fourth " +
  "attempt is authorized by this record. Three pushes and five defect classes have produced ZERO " +
  "metric values; M1-M13 remain null. Training stays COMPLETED, the adapter stays EXPERIMENTAL and " +
  "unpromoted, evaluation stays NOT_RUN with evaluationResults 0, and GHARIBO-V0.1 stays NOT_CREATED.";

const DEC0036_RATIONALE =
  "The purpose of recording a third failure as an ESCALATION rather than a fourth bug is to keep a " +
  "technical loop from quietly becoming a policy. Each individual repair was justified and each was " +
  "verified adversarially; the defects found were real, and two of the five were introduced by the " +
  "fix for the one before. But the aggregate fact is that three kernel pushes have consumed " +
  "accelerator quota and produced zero measurements, and the failure classes are converging on the " +
  "model-loading path rather than spreading randomly. That convergence is a finding about the plan, " +
  "not a bug in a cell, and it is exactly what DEC-0035 anticipated when it wrote the escalation " +
  "rule before it was needed. The distinction this record protects is between 'technically unspent' " +
  "and 'available to retry': the authorization is still unspent, and the answer is still no. A " +
  "harness that keeps re-authorizing itself is not a harness that is being governed.";

// ---------------------------------------------------------------- 1. decision index
if (!state.decisions.some((d) => d.id === "DEC-0036")) {
  state.decisions.push({
    id: "DEC-0036",
    date: "2026-09-16",
    title:
      "Halt the evaluation-harness repair loop after a third pre-inference failure and escalate to the CEO",
    status: "ACCEPTED",
    decision: DEC0036_TEXT,
    rationale: DEC0036_RATIONALE,
    scope: ["training", "experiments", "models", "integrations"],
    references: [
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/DEC-0036-evaluation-escalation.json",
      "governance/DEC-0035-evaluation-kernel-relaunch.json",
      "governance/DEC-0032-evaluation-authorization.json",
      "scripts/eval/verify-eval-failure-evidence.py",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });
}

{
  const dec0036 = state.decisions.find((d) => d.id === "DEC-0036");
  if (dec0036) {
    dec0036.title =
      "Halt the evaluation-harness repair loop after a third pre-inference failure and escalate to the CEO";
    dec0036.decision = DEC0036_TEXT;
    dec0036.rationale = DEC0036_RATIONALE;
  }
}

for (const id of ["DEC-0034", "DEC-0035", "DEC-0036"]) {
  const d = state.decisions.find((x) => x.id === id);
  if (!d) continue;
  for (const ref of d.references ?? []) {
    if (!existsSync(resolve(ROOT, ref))) {
      console.error(`REFUSING TO WRITE: ${id} references a path that does not exist: ${ref}`);
      process.exit(1);
    }
  }
}

// ---------------------------------------------------------------- 2. evaluationAuthorization
const ea = state.training.evaluationAuthorization;
if (ea) {
  ea.escalationDecisionId = "DEC-0036";
  ea.escalationHash = ESCALATION_HASH;
  ea.escalationRecord = "governance/DEC-0036-evaluation-escalation.json";
  ea.escalationReason =
    "Third pre-inference failure triggers DEC-0035's own escalation rule. No repair, no push, and " +
    "no fourth attempt is authorized by this record.";

  ea.thirdLaunchKernelId = "vokaigharibo/gharibo-eval-001-fec22ca2";
  ea.thirdLaunchKernelVersion = 3;
  ea.thirdLaunchStatus = "KernelWorkerStatus.ERROR";
  ea.thirdLaunchOutcome = "FAILED_PRE_INFERENCE";
  ea.thirdLaunchFailureDefectId = "DEF-0036-E";
  ea.thirdLaunchFailureClass = "HARNESS_DEFECT_NO_EXECUTION";
  ea.thirdLaunchFailurePhase = "MODEL_LOAD";
  ea.thirdLaunchFailureCell = "cell 6 (base model load)";
  ea.thirdLaunchFailureException = "RuntimeError";
  ea.thirdLaunchTestInferenceOccurred = false;
  ea.thirdLaunchReachedInstallStage = true;
  ea.thirdLaunchReachedModelLoad = true;
  ea.thirdLaunchModelObjectConstructed = false;

  ea.activeKernelVersion = 3;
  ea.activeKernelStatusAtRecordTime = "ERROR";

  ea.launchAttempts = 3;
  ea.defectClassesFound = 5;
  ea.harnessRepairs = 2;
  ea.metricValuesProducedAfterThreeLaunches = 0;

  ea.authorizationSpent = false;
  ea.authorizationStateIsFragile = true;
  ea.hardStops2Satisfied = false;
  ea.hardStops3Satisfied = true;
  ea.predictionsDownloaded = false;
  ea.scoringPerformed = false;

  ea.harnessRepairLoopHalted = true;
  ea.furtherAttemptAuthorized = false;
  ea.furtherAttemptRequiresNewDecision = true;
  ea.furtherAttemptRequiresNewDecisionReason =
    "A third pre-inference failure must be escalated rather than repaired (DEC-0035's stated rule). " +
    "The CEO may authorize one further targeted repair, authorize a diagnostic no-inference probe, " +
    "change the runtime, or conclude the benchmark is not executable under the zero-cost mandate.";

  ea.note =
    "Authorization to measure only. The authorized benchmark has been launched THREE times; all " +
    "three attempts failed pre-inference and all three failures are recorded as failures. Five " +
    "distinct defect classes were found and closed, two of them introduced by the repair for the " +
    "one before, and three kernel pushes have produced ZERO metric values. The third failure " +
    "triggers the escalation rule stated in DEC-0035, so the repair loop is HALTED and the decision " +
    "to continue belongs to the CEO. No score exists: every M1-M13 value is null until prediction " +
    "payloads are retrieved and scored locally against held-out gold. Training stays COMPLETED, the " +
    "adapter stays EXPERIMENTAL and unpromoted, and GHARIBO-V0.1 stays NOT_CREATED.";
}

// ---------------------------------------------------------------- 3. currentState.blockerSummary
if (state.currentState) {
  state.currentState.blockerSummary = {
    openBlockers: 0,
    closedBlockers: (state.blockers ?? []).filter((b) => b.status === "CLOSED").length,
    blockingNow:
      "None at the governance level. BLK-0004 (no GPU execution environment) is CLOSED - the " +
      "execution environment was obtained and the kernel pushed three times. The active constraint " +
      "is no longer a blocker but an ESCALATION: the harness has failed pre-inference three times, " +
      "and DEC-0036 halts automated repair pending a CEO decision.",
    note:
      "A closed blocker is not a satisfied objective. BLK-0004 was closed by obtaining a runtime, " +
      "not by obtaining a result; three launches have produced zero measurements.",
  };
}

// ---------------------------------------------------------------- 4. active action
const act = (state.actions ?? []).find((a) => a.id === "ACT-0001");
if (act) {
  act.status = "BLOCKED_ON_HUMAN_DECISION";
  act.note =
    "Escalated by DEC-0036. Three pre-inference kernel failures; the harness-repair loop is halted. " +
    "The next step is a CEO decision choosing between a targeted further repair, a diagnostic " +
    "no-inference probe, a runtime change, or postponement - not another automated push.";
}

// ---------------------------------------------------------------- 5. version
state.masterStateVersion = "1.16.0";

writeFileSync(MASTER, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log(`patched ${MASTER_REL}`);
console.log(`  decisions        : ${state.decisions.length} (latest DEC-0036)`);
console.log(
  `  blockers         : ${(state.blockers ?? []).map((b) => `${b.id}:${b.status}`).join(" ")}`,
);
console.log(`  masterStateVersion: ${state.masterStateVersion}`);
console.log(`  escalationHash   : ${ESCALATION_HASH}`);
console.log(`  launchAttempts   : ${ea ? ea.launchAttempts : "(none)"}`);
console.log(`  defectClasses    : ${ea ? ea.defectClassesFound : "(none)"}`);
console.log(`  furtherAttempt   : ${ea ? ea.furtherAttemptAuthorized : "(none)"}`);
