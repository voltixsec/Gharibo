#!/usr/bin/env node
/**
 * apply-dec0038-authorization.mjs — idempotent master-state patcher for the DEC-0038 authorization.
 *
 * What it does, in order:
 *   1. pushes DEC-0038 into the decision index if absent, and reconciles it if present;
 *   2. validates every reference path in DEC-0036/0037/0038 exists;
 *   3. updates training.evaluationAuthorization to record the new authorization;
 *   4. updates training.diagnosticAuthorization to record that attempt #4 is now authorized;
 *   5. rewrites currentState.blockerSummary;
 *   6. updates the active action;
 *   7. bumps masterStateVersion.
 *
 * Like apply-dec0036-escalation.mjs, the reconcile step matters: a patcher that only ever pushes new
 * entries silently leaves already-present ones stale.
 *
 * Usage: node scripts/eval/apply-dec0038-authorization.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { authorizationHash } from "./build-dec0038-authorization.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MASTER_REL = "governance/GHARIBO_MASTER_STATE.json";
const MASTER = resolve(ROOT, MASTER_REL);

const AUTHORIZATION_HASH = authorizationHash();

const state = JSON.parse(readFileSync(MASTER, "utf8"));

const DEC0038_TEXT =
  "Evaluation attempt #4 is AUTHORIZED WITH LIMITS. Exactly ONE governed held-out TEST benchmark " +
  "execution may be pushed - ONE kernel push, no retries - covering the BASE arm and then the " +
  "CANDIDATE arm over the SAME 80 held-out TEST records, scored under the frozen " +
  "gharibo-eval-harness-1.0.0 contract with decoding identical across arms (temperature 0.0, " +
  "do_sample false, top_p 1.0, top_k 0, max_new_tokens 1024, seed 0, repeats 1). The authorization " +
  "rests on DEC-0037, which completed one isolated no-inference diagnostic and returned PASS: the " +
  "governed three-stage install, the tokenizer load and the 4-bit BASE load all succeed on the " +
  "free-tier T4 with test_accessed false and inference_executed false. The DEC-0037 loading " +
  "convention is binding and is reused unchanged: FastLanguageModel.from_pretrained with " +
  "model_name 'unsloth/gpt-oss-20b', dtype=None, load_in_4bit=True and NO revision= argument, " +
  "because passing the pinned base revision to the Unsloth DISTRIBUTION repo id is what produced " +
  "DEF-0035-D. The pinned base revision continues to be asserted separately against the live " +
  "openai/gpt-oss-20b repository. The optional additional_chat_templates HTTP 404 reproduced during " +
  "the DEC-0037 PASS in which the model still loaded, so it is recorded as REPRODUCED AND NOT FATAL " +
  "ON ITS OWN; transport causation remains unproven and is not asserted. Two hard rules bind the " +
  "attempt: (1) if TEST inference materially begins the authorization is SPENT - a poor result is " +
  "never a reason to rerun, BASE output is never a reason to alter CANDIDATE settings, and the run " +
  "continues if technically possible; (2) if the run fails BEFORE inference the exact failure is " +
  "proven from logs and markers, recorded, reconciled, committed and pushed, and then STOPPED - no " +
  "repair-and-retry and no attempt #5 without a further explicit human decision. Retraining, " +
  "checkpoint selection, prompt/few-shot/threshold tuning, dataset mutation, TEST-driven code " +
  "optimisation, model selection, promotion and creating GHARIBO-V0.1 are all expressly forbidden. " +
  "M1-M13 remain null until real predictions exist and are never written as 0, 'N/A', or an " +
  "estimate. Training stays COMPLETED, the adapter stays EXPERIMENTAL and unpromoted, evaluation " +
  "stays NOT_RUN at record time, and GHARIBO-V0.1 stays NOT_CREATED.";

const DEC0038_RATIONALE =
  "DEC-0036 halted automated repair because three pushes against a live accelerator quota had " +
  "produced zero measurements, and it was right that the decision to continue belonged to the " +
  "person who owns the authorization. DEC-0037 was the answer to that escalation, and it answered " +
  "it narrowly and well: with no TEST access and no inference, it proved that the governed install " +
  "path, the tokenizer load and the 4-bit BASE load all succeed on the free-tier runtime, and it " +
  "proved that the 404 which killed attempt #3 does NOT by itself prevent the model from loading. " +
  "That converts a converging pattern of harness failures into a bounded, evidence-backed basis for " +
  "exactly one more attempt - and the bounding is the substance of this decision. The attempt is " +
  "one push, two arms, one fixed TEST set, one frozen decoding contract, no tuning and no " +
  "selection, because the moment an attempt may be repeated for a better number, or adjusted after " +
  "seeing one arm's output, the measurement stops being a measurement. The distinction DEC-0036 " +
  "protected between 'technically unspent' and 'available to retry' is preserved here in a " +
  "different form: this authorization is available to EXECUTE, not to iterate. A benchmark that is " +
  "allowed to fail pre-inference without consequence and then be silently retried is precisely the " +
  "loop DEC-0036 halted, and it is not reopened by this record.";

// ---------------------------------------------------------------- 1. decision index
if (!state.decisions.some((d) => d.id === "DEC-0038")) {
  state.decisions.push({
    id: "DEC-0038",
    date: "2026-09-16",
    title:
      "Authorize evaluation attempt #4: one governed BASE-then-CANDIDATE TEST benchmark on the DEC-0037 proven loading path",
    status: "ACCEPTED",
    decision: DEC0038_TEXT,
    rationale: DEC0038_RATIONALE,
    scope: ["training", "experiments", "models", "integrations"],
    references: [
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "governance/DEC-0036-evaluation-escalation.json",
      "governance/DEC-0032-evaluation-authorization.json",
      "scripts/eval/build-eval-kernel.mjs",
    ],
    supersedes: null,
    supersededBy: null,
    architectureChanging: false,
  });
}

{
  const dec0038 = state.decisions.find((d) => d.id === "DEC-0038");
  if (dec0038) {
    dec0038.title =
      "Authorize evaluation attempt #4: one governed BASE-then-CANDIDATE TEST benchmark on the DEC-0037 proven loading path";
    dec0038.decision = DEC0038_TEXT;
    dec0038.rationale = DEC0038_RATIONALE;
  }
}

for (const id of ["DEC-0036", "DEC-0037", "DEC-0038"]) {
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
  ea.attempt4AuthorizationDecisionId = "DEC-0038";
  ea.attempt4AuthorizationHash = AUTHORIZATION_HASH;
  ea.attempt4AuthorizationRecord = "governance/DEC-0038-evaluation-attempt-4-authorization.json";
  ea.attempt4AuthorizationStatus = "AUTHORIZED_WITH_LIMITS";
  ea.attempt4Number = 4;
  ea.attempt4MaximumKernelPushes = 1;
  ea.attempt4Arms = ["base", "candidate"];
  ea.attempt4ArmOrder = "BASE_THEN_CANDIDATE";
  ea.attempt4SameTestRecordsForBothArms = true;
  ea.attempt4TestRecordCount = 80;
  ea.attempt4TestSplitHash = "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b";
  ea.attempt4HarnessVersion = "gharibo-eval-harness-1.0.0";
  ea.attempt4Pushed = false;
  ea.attempt4KernelId = null;
  ea.attempt4KernelVersion = null;
  ea.attempt4Status = "AUTHORIZED_NOT_YET_PUSHED";
  ea.attempt4TestInferenceOccurred = false;

  ea.attempt4LoaderConvention =
    "FastLanguageModel.from_pretrained(model_name='unsloth/gpt-oss-20b', max_seq_length=1024, " +
    "dtype=None, load_in_4bit=True) with NO revision= argument — the DEC-0037 proven path, reused " +
    "unchanged.";
  ea.attempt4LoaderConventionProvenBy = "DEC-0037";
  ea.attempt4RedesignForbidden = true;
  ea.attempt4AdditionalChatTemplates404Status = "REPRODUCED_AND_NON_FATAL";

  ea.attempt4DecodingIdenticalAcrossArms = true;
  ea.attempt4CandidateSettingsNotAlteredAfterBaseOutput = true;

  ea.attempt4AuthorizationSpentOnInferenceStart = true;
  ea.attempt4OnPreInferenceFailure =
    "Record the exact failure, prove it from logs and markers, reconcile governance, commit and " +
    "push the evidence, and STOP. No repair-and-retry. No attempt #5 without a further explicit " +
    "human decision.";
  ea.attempt4AutomaticRetryAuthorized = false;
  ea.attempt4FurtherAttemptRequiresNewDecision = true;
  ea.attempt4FifthAttemptAuthorized = false;

  ea.attempt4PromotionAuthorized = false;
  ea.attempt4TuningAuthorized = false;
  ea.attempt4ModelSelectionAuthorized = false;
  ea.attempt4GhariboV01CreationAuthorized = false;
  ea.attempt4DatasetMutationAuthorized = false;
  ea.attempt4TestDrivenCodeOptimisationAuthorized = false;

  ea.authorizationSpent = false;
  ea.hardStops2Satisfied = false;
  ea.hardStops3Satisfied = true;
  ea.metricValuesProduced = 0;
  ea.predictionsDownloaded = false;
  ea.scoringPerformed = false;
  ea.evaluationStatus = "NOT_RUN";
  ea.evaluationResults = 0;

  ea.note =
    "Authorization to measure only. Attempt #4 is authorized as EXACTLY ONE governed execution: one " +
    "kernel push, no retries, BASE then CANDIDATE over the same 80 held-out TEST records, one frozen " +
    "decoding contract, scored under gharibo-eval-harness-1.0.0. It rests on the DEC-0037 PASS and " +
    "reuses the DEC-0037 loading path unchanged (no revision= argument); redesigning the loader is " +
    "out of scope. If TEST inference begins the authorization is SPENT and the run is never repeated " +
    "for a poor result; if it fails pre-inference the failure is proven, recorded and STOPPED without " +
    "repair. M1-M13 are null until real predictions exist and are never written as 0, 'N/A', or an " +
    "estimate. Training stays COMPLETED, the adapter stays EXPERIMENTAL and unpromoted, and " +
    "GHARIBO-V0.1 stays NOT_CREATED.";
}

// ---------------------------------------------------------------- 3. diagnosticAuthorization
const da = state.training.diagnosticAuthorization;
if (da) {
  da.evaluationAttempt4Authorized = true;
  da.evaluationAttempt4AuthorizationDecisionId = "DEC-0038";
  da.evaluationAttempt4AuthorizationHash = AUTHORIZATION_HASH;
  da.evaluationAttempt4AuthorizedAt = "2026-09-16T07:30:00.000Z";
  da.evaluationAttempt4AuthorizationBasis =
    "DEC-0037 returned PASS and answered the DEC-0036 escalation; attempt #4 is authorized as one " +
    "bounded execution on the proven loading path.";
  da.next =
    "ATTEMPT_4_AUTHORIZED_ONE_PUSH_BASE_THEN_CANDIDATE_OVER_80_HELD_OUT_TEST_RECORDS";
  da.note =
    "Diagnostic completed and consumed; the escalation it answered is closed by DEC-0038, which " +
    "authorizes attempt #4 at one kernel push.";
}

// ---------------------------------------------------------------- 4. currentState.blockerSummary
if (state.currentState) {
  state.currentState.blockerSummary = {
    openBlockers: 0,
    closedBlockers: (state.blockers ?? []).filter((b) => b.status === "CLOSED").length,
    blockingNow:
      "None at the governance level, and none at the infrastructure level. BLK-0004 (no GPU " +
      "execution environment) is CLOSED, and the DEC-0036 escalation is ANSWERED: DEC-0037 proved " +
      "on the free-tier T4 that the governed install, the tokenizer load and the 4-bit BASE load " +
      "all succeed with no TEST access and no inference. The active position is an AUTHORIZATION: " +
      "DEC-0038 permits exactly ONE governed execution (attempt #4), BASE then CANDIDATE, one " +
      "kernel push, no retries.",
    note:
      "A closed blocker is not a satisfied objective, and an authorization is not a result. Three " +
      "launches produced zero measurements; attempt #4 is the one bounded opportunity to produce " +
      "them, and M1-M13 stay null until it does.",
  };
}

// ---------------------------------------------------------------- 5. active action
const act = (state.nextActions ?? []).find((a) => a.id === "ACT-0001");
if (act) {
  act.status = "AUTHORIZED_AWAITING_EXECUTION";
  act.note =
    "Authorized by DEC-0038 as attempt #4: ONE kernel push, BASE then CANDIDATE over the same 80 " +
    "held-out TEST records, on the DEC-0037 proven loading path, under the frozen harness contract. " +
    "Authorization is SPENT the moment TEST inference begins; a pre-inference failure is proven, " +
    "recorded and STOPPED rather than repaired. No promotion follows automatically.";
}

// ---------------------------------------------------------------- 6. version
state.masterStateVersion = "1.18.0";

writeFileSync(MASTER, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log(`patched ${MASTER_REL}`);
console.log(`  decisions        : ${state.decisions.length} (latest DEC-0038)`);
console.log(
  `  blockers         : ${(state.blockers ?? []).map((b) => `${b.id}:${b.status}`).join(" ")}`,
);
console.log(`  masterStateVersion: ${state.masterStateVersion}`);
console.log(`  authorizationHash : ${AUTHORIZATION_HASH}`);
console.log(`  attempt4Status    : ${ea ? ea.attempt4Status : "(none)"}`);
console.log(`  maximumPushes     : ${ea ? ea.attempt4MaximumKernelPushes : "(none)"}`);
console.log(`  autoRetry         : ${ea ? ea.attempt4AutomaticRetryAuthorized : "(none)"}`);
