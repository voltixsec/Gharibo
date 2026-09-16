#!/usr/bin/env node
/**
 * build-dec0038-authorization.mjs — deterministic generator for the DEC-0038 record.
 *
 * DEC-0038 is the CEO's explicit authorization for evaluation attempt #4: exactly ONE governed
 * benchmark execution covering the BASE arm and then the CANDIDATE arm over the SAME 80 held-out
 * TEST records, recorded durably BEFORE any TEST inference occurs.
 *
 * WHY THIS RECORD EXISTS
 * ----------------------
 * DEC-0036 halted the harness-repair loop after three pre-inference failures and escalated to the
 * CEO. DEC-0037 then ran one isolated, no-inference diagnostic and PASSED: the governed three-stage
 * install, the tokenizer load and the 4-bit BASE load all succeed on the free-tier T4, with no
 * TEST access and no inference. That result established two things the three failed launches could
 * not:
 *
 *   1. the DEC-0037 loader convention is the PROVEN one
 *      (`FastLanguageModel.from_pretrained(model_name='unsloth/gpt-oss-20b', max_seq_length=...,
 *       dtype=None, load_in_4bit=True)` — deliberately WITHOUT `revision=`);
 *   2. the `additional_chat_templates` HTTP 404 is NOT fatal on its own, because the model and
 *      tokenizer loaded successfully in the same run in which it reproduced.
 *
 * With the escalation answered, this record is the CEO's decision. It authorizes measurement and
 * nothing else.
 *
 * WHAT THIS RECORD AUTHORIZES
 *   - ONE attempt (#4), ONE kernel push.
 *   - TWO arms, BASE first then CANDIDATE, over the SAME 80 held-out TEST records.
 *   - M1-M13 scoring of both arms under the frozen `gharibo-eval-harness-1.0.0` contract.
 *
 * WHAT THIS RECORD FORBIDS
 *   - Retraining, checkpoint selection, prompt tuning, few-shot tuning, threshold tuning.
 *   - Dataset mutation, TEST-driven code optimisation, model selection, promotion.
 *   - Creating GHARIBO-V0.1. A FIFTH attempt. Automatic retry after ANY outcome.
 *
 * THE TWO HARD RULES CARRIED FORWARD
 *   - SPENT ON INFERENCE START: if TEST inference materially begins, the authorization is SPENT.
 *     Poor results are never a reason to rerun, and BASE output is never a reason to alter CANDIDATE
 *     settings. The run continues if it is technically possible, and whatever it produces is the
 *     result.
 *   - PRE-INFERENCE FAILURE: record the exact failure, prove it from logs and markers, then STOP.
 *     No repair-and-retry, no attempt #5 without a further explicit human decision.
 *
 * DETERMINISM
 * -----------
 * The body is a pure constant apart from identity facts read from the committed artifacts. No clock,
 * no network, no inference from live kernel state.
 *
 * Usage:
 *   node scripts/eval/build-dec0038-authorization.mjs          # write the governance record
 *   node scripts/eval/build-dec0038-authorization.mjs --check  # exit 1 if the file is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0038-evaluation-attempt-4-authorization.json";

const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";
const BUNDLE_REL = "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json";

/** Canonical form: object keys sorted recursively (the repo-wide hash convention). */
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

const sha256File = (rel) =>
  createHash("sha256")
    .update(readFileSync(resolve(ROOT, rel)))
    .digest("hex");

export function observedIdentities() {
  if (!existsSync(resolve(ROOT, NOTEBOOK_REL))) {
    throw new Error(`build-dec0038: ${NOTEBOOK_REL} is missing`);
  }
  const notebookSha256 = sha256File(NOTEBOOK_REL);
  let launchBundleHash = null;
  if (existsSync(resolve(ROOT, BUNDLE_REL))) {
    launchBundleHash = JSON.parse(readFileSync(resolve(ROOT, BUNDLE_REL), "utf8")).launchBundleHash;
  }
  return { notebookSha256, launchBundleHash };
}

export function evaluationAuthorizationBody() {
  const observed = observedIdentities();
  return {
    // ---------------------------------------------------------------- identity
    status: "EVALUATION_ATTEMPT_4_AUTHORIZED_WITH_LIMITS",
    decisionId: "DEC-0038",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0036",
    recordKind: "ATTEMPT_4_AUTHORIZATION_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T07:30:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    authority: "Explicit CEO instruction in current task",
    decision: "AUTHORIZED WITH LIMITS",
    decisionScope:
      "EXACTLY ONE governed held-out TEST benchmark execution (attempt #4) of the BASE arm followed " +
      "by the CANDIDATE arm, over the SAME 80 held-out TEST records, scored under the frozen " +
      "gharibo-eval-harness-1.0.0 metric contract.",
    decisionBasis:
      "DEC-0037 completed ONE isolated no-inference diagnostic and returned PASS: the governed " +
      "three-stage install, the tokenizer load and the 4-bit BASE load all succeed on the free-tier " +
      "T4 with test_accessed false and inference_executed false. That answers the escalation DEC-0036 " +
      "raised, and it answers it on the requirement that governs the launch anyway - the DEC-0037 " +
      "loading convention is the proven one. The optional additional_chat_templates HTTP 404 " +
      "reproduced in that same run and the model still loaded, therefore the 404 is NOT fatal on " +
      "its own and is not a reason to withhold the attempt.",
    recordBasis: "docs/EVALUATION_BENCHMARK_LAUNCH.md",

    // ---------------------------------------------------------------- what is authorized
    attemptNumber: 4,
    maximumKernelPushes: 1,
    arms: ["base", "candidate"],
    armOrder: "BASE_THEN_CANDIDATE",
    baseArmRequiredFirst: true,
    sameTestRecordsForBothArms: true,
    testRecordCount: 80,
    testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    harnessVersion: "gharibo-eval-harness-1.0.0",
    metricIds: [
      "M1",
      "M2",
      "M3",
      "M4",
      "M5",
      "M6",
      "M7",
      "M8",
      "M9",
      "M10",
      "M11",
      "M12",
      "M13",
    ],

    // ---------------------------------------------------------------- the proven path (binding)
    requiredLoaderConvention:
      "FastLanguageModel.from_pretrained(model_name=PINS['loaderModelId'] /* 'unsloth/gpt-oss-20b' */, " +
      "max_seq_length=PINS['maxSeqLength'], dtype=None, load_in_4bit=True) — WITHOUT a revision= " +
      "argument, exactly as proven by DEC-0037.",
    requiredLoaderConventionProvenBy: "DEC-0037",
    requiredLoaderConventionReason:
      "Passing the pinned base revision as revision= to the Unsloth DISTRIBUTION repo id is what " +
      "produced DEF-0035-D: the argument is dropped and the load becomes unsatisfiable. The pinned " +
      "base revision is asserted SEPARATELY, in its own cell, against the live openai/gpt-oss-20b " +
      "repository. Reusing the proven path is the point of this attempt; redesigning it is out of " +
      "scope and is expressly forbidden.",
    additionalChatTemplates404Status: "REPRODUCED_AND_NON_FATAL",
    additionalChatTemplates404Note:
      "The optional additional_chat_templates directory returned HTTP 404 on the distribution root " +
      "while the unchanged governed loader still loaded tokenizer and BASE successfully (DEC-0037). " +
      "It is therefore NOT treated as a launch blocker, and transport causation remains unproven and " +
      "must not be asserted.",

    // ---------------------------------------------------------------- decoding contract (frozen)
    decoding: {
      temperature: 0.0,
      doSample: false,
      topP: 1.0,
      topK: 0,
      maxNewTokens: 1024,
      seed: 0,
      repeats: 1,
      maxSeqLength: 1024,
      reasoningEffort: "medium",
    },
    decodingIdenticalAcrossArms: true,
    decodingFrozenBeforeBaseOutput: true,
    candidateSettingsNotAlteredAfterBaseOutput: true,

    // ---------------------------------------------------------------- forbidden by this authorization
    retrainingAuthorized: false,
    checkpointSelectionAuthorized: false,
    promptTuningAuthorized: false,
    fewShotTuningAuthorized: false,
    thresholdTuningAuthorized: false,
    datasetMutationAuthorized: false,
    testDrivenCodeOptimisationAuthorized: false,
    modelSelectionAuthorized: false,
    promotionAuthorized: false,
    ghariboV01CreationAuthorized: false,
    fifthAttemptAuthorized: false,
    automaticRetryAuthorized: false,

    // ---------------------------------------------------------------- the two hard rules
    authorizationSpentOnInferenceStart: true,
    authorizationSpentRule:
      "If TEST inference materially begins, the authorization is SPENT. A poor result is NEVER a " +
      "reason to rerun, and BASE output is NEVER a reason to alter CANDIDATE settings. The single " +
      "authorized run continues if it is technically possible, and whatever it produces is the " +
      "result.",
    onPreInferenceFailure:
      "Record the exact failure, prove it from logs and runtime markers, reconcile governance, " +
      "commit and push the evidence, and STOP. No repair-and-retry. No attempt #5 without a further " +
      "explicit human decision.",
    onPreInferenceFailureRepairAuthorized: false,
    onPreInferenceFailureFurtherAttemptRequiresNewDecision: true,

    // ---------------------------------------------------------------- prerequisites satisfied
    priorDecisionId: "DEC-0036",
    priorDecisionStatus: "ESCALATION_ANSWERED_BY_THIS_DECISION",
    diagnosticDecisionId: "DEC-0037",
    diagnosticStatus: "PASS",
    diagnosticKernelId: "vokaigharibo/gharibo-diagnostic-dec0037",
    diagnosticProvedInstall: true,
    diagnosticProvedTokenizerLoad: true,
    diagnosticProvedModelLoad: true,
    diagnosticProvedLoaderConvention: true,
    diagnosticTestAccessed: false,
    diagnosticInferenceExecuted: false,

    // ---------------------------------------------------------------- identity of the artifact
    notebookSha256: observed.notebookSha256,
    launchBundleHash: observed.launchBundleHash,
    promptsSha256: "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333",
    candidateArmId: "GHARIBO-exp-001",
    candidateAdapterSha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
    baseModel: "openai/gpt-oss-20b",
    baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
    loaderModelId: "unsloth/gpt-oss-20b",
    datasetHash: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
    payloadBasis: "PROMPTS_ONLY",
    datasetVisibility: "PRIVATE",
    goldPayloadIncluded: false,
    goldPayloadAccessed: false,
    baselineCommit: "8d290e4587a51317d104fa89bb3cc6784ec12a74",

    // ---------------------------------------------------------------- authorization accounting
    priorAuthorizationDecisionId: "DEC-0032",
    priorAuthorizationConsumed: true,
    priorAuthorizationSpent: false,
    priorAuthorizationNote:
      "DEC-0032's single execution is CONSUMED (committed to) and still UNSENT (spent) because no " +
      "attempt reached TEST inference. DEC-0038 does not extend DEC-0032; it replaces the halted " +
      "retry posture with ONE explicitly bounded attempt.",
    authorizationConsumed: true,
    authorizationSpent: false,
    harnessRepairLoopHalted: true,
    harnessRepairLoopHaltedReason:
      "DEC-0036 halted automated repair. This attempt is a HUMAN decision, not a resumption of the " +
      "loop: it is one attempt, it is bounded, and no automated retry follows it.",
    launchAttemptsPrior: 3,
    defectClassesFoundPrior: 5,
    harnessRepairsPrior: 2,
    metricValuesProducedPrior: 0,

    // ---------------------------------------------------------------- honesty at record time
    testInferenceOccurredAtRecordTime: false,
    testRecordsParsedLocally: 0,
    predictionsDownloaded: false,
    scoringPerformed: false,
    evaluationStatus: "NOT_RUN",
    evaluationResults: 0,
    metricValuesRemainNull: true,
    metricValuesAreNotPlaceholders:
      "M1-M13 are null at record time because no inference has run. A null is recorded as null: it " +
      "is never written as 0, never as 'N/A', and never estimated.",

    // ---------------------------------------------------------------- standing state
    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",
    promotionPerformed: false,
    tuningPerformed: false,
    selectionPerformed: false,
    ghariboV01Created: false,

    note:
      "Attempt #4 authorized on the strength of the DEC-0037 PASS. ONE governed benchmark execution, " +
      "ONE kernel push: BASE then CANDIDATE over the same 80 held-out TEST records, scored under the " +
      "frozen harness contract with decoding identical across arms. The DEC-0037 loading convention " +
      "(no revision= argument) is reused unchanged and is NOT to be redesigned. If TEST inference " +
      "begins the authorization is SPENT and the run is never repeated for a poor result; if the run " +
      "fails before inference the failure is proven, recorded, and then STOPPED without repair. " +
      "M1-M13 remain null until real predictions exist. Training stays COMPLETED, the adapter stays " +
      "EXPERIMENTAL and unpromoted, and GHARIBO-V0.1 stays NOT_CREATED.",

    references: [
      "governance/DEC-0036-evaluation-escalation.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "governance/DEC-0032-evaluation-authorization.json",
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
      "scripts/eval/build-eval-kernel.mjs",
    ],
  };
}

export function evaluationAuthorizationRecord() {
  const body = evaluationAuthorizationBody();
  return { ...body, authorizationHash: sha256Canonical(body) };
}

export function render() {
  const ordered = evaluationAuthorizationBody();
  const record = evaluationAuthorizationRecord();
  const stable = { ...ordered, authorizationHash: record.authorizationHash };
  return JSON.stringify(stable, null, 2) + "\n";
}

export function authorizationHash() {
  return evaluationAuthorizationRecord().authorizationHash;
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`build-dec0038 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0038 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(
      `build-dec0038 --check: ${OUT_REL} is current (authorizationHash ${authorizationHash().slice(0, 12)}…)`,
    );
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision : DEC-0038 — AUTHORIZED WITH LIMITS (attempt #4)`);
  console.log(`  arms     : BASE then CANDIDATE over the same 80 TEST records`);
  console.log(`  pushes   : 1   retries: 0   promotion: no`);
  console.log(`  authorizationHash: ${authorizationHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
