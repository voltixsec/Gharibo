#!/usr/bin/env node
/**
 * build-dec0036-escalation.mjs — deterministic generator for the DEC-0036 record.
 *
 * DEC-0036 records the THIRD launch of the evaluation kernel: the second repair was pushed, ran
 * further than either previous attempt (all three governed install stages completed, the base model
 * load began), and then died pre-inference on a FIFTH distinct defect class.
 *
 * WHY THIS RECORD EXISTS, AND WHY IT IS AN ESCALATION
 * ---------------------------------------------------
 * DEC-0035 stated the rule this record now triggers:
 *
 *   "A THIRD pre-inference failure must be escalated to the CEO rather than repaired again, because
 *    repeated harness failure is now itself evidence about the plan."
 *
 * This is that third failure. What follows is deliberately NOT a fourth repair. The honest reading
 * of three pushes and five defect classes with ZERO inference is that the harness is being debugged
 * in production against an accelerator quota, and that the decision to continue belongs to the
 * person who owns the authorization — not to the harness that keeps failing.
 *
 * WHAT IS STILL TRUE
 *   - No TEST inference occurred. Derived, not asserted: `verify-eval-failure-evidence.py` scans
 *     eight inference markers, finds none, and classifies the run as pre-inference (4/4).
 *   - The single authorized execution is therefore STILL unspent by the letter of hardStops[2].
 *   - No M1-M13 value exists. Three launches and five defect classes have produced zero metrics.
 *
 * WHAT THIS RECORD DOES NOT DO
 *   - It does not repair. It does not push. It does not authorize a fourth attempt.
 *   - It does not claim the failure is benign merely because it is pre-inference. Three failures is
 *     a pattern, and the pattern is the finding.
 *   - It does not promote, tune, or create GHARIBO-V0.1.
 *
 * DETERMINISM
 * ----------
 * The body is a pure constant apart from identity facts read from the committed artifacts. No clock,
 * no network, no inference from the live kernel state.
 *
 * Usage:
 *   node scripts/eval/build-dec0036-escalation.mjs          # write the governance record
 *   node scripts/eval/build-dec0036-escalation.mjs --check  # exit 1 if the file is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0036-evaluation-escalation.json";

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
    throw new Error(`build-dec0036: ${NOTEBOOK_REL} is missing`);
  }
  const notebookSha256 = sha256File(NOTEBOOK_REL);
  let launchBundleHash = null;
  if (existsSync(resolve(ROOT, BUNDLE_REL))) {
    launchBundleHash = JSON.parse(readFileSync(resolve(ROOT, BUNDLE_REL), "utf8")).launchBundleHash;
  }
  return { notebookSha256, launchBundleHash };
}

export function evaluationEscalationBody() {
  const observed = observedIdentities();
  return {
    // ---------------------------------------------------------------- identity
    status: "EVALUATION_ESCALATED_TO_CEO_AFTER_THIRD_PRE_INFERENCE_FAILURE",
    decisionId: "DEC-0036",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0035",
    recordKind: "ESCALATION_AND_HALT_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T04:45:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision:
      "HALT THE HARNESS-REPAIR LOOP AND ESCALATE TO THE CEO; DO NOT REPAIR OR PUSH A FOURTH TIME " +
      "WITHOUT AN EXPLICIT NEW HUMAN DECISION",
    decisionBasis:
      "DEC-0035 recorded the binding rule that a third pre-inference failure must be escalated " +
      "rather than repaired, because repeated harness failure is itself evidence about the plan.",
    recordBasis: "docs/EVALUATION_BENCHMARK_LAUNCH.md",

    // ---------------------------------------------------------------- the third failure
    failedLaunchId: "DEC-0036",
    failedLaunchKernelId: "vokaigharibo/gharibo-eval-001-fec22ca2",
    failedLaunchKernelVersion: 3,
    failedLaunchKernelStatus: "KernelWorkerStatus.ERROR",
    failedLaunchOutcome: "FAILED_PRE_INFERENCE",
    failedLaunchFailureClass: "HARNESS_DEFECT_NO_EXECUTION",
    failedLaunchFailureDefectId: "DEF-0036-E",
    failedLaunchFailureException: "RuntimeError",
    failedLaunchFailureMessage:
      "Unsloth: Could not load the tokenizer/processor. If you are offline, make sure the tokenizer " +
      "files exist in the checkpoint folder or were previously downloaded to the Hugging Face " +
      "cache, or set HF_HUB_OFFLINE=1 to force local loading.",
    failedLaunchFailureCell: "cell 6 (base model load)",
    failedLaunchFailurePhase: "MODEL_LOAD",
    failedLaunchFailureLine:
      "/usr/local/lib/python3.12/dist-packages/unsloth/models/vision.py in from_pretrained -> " +
      "raise RuntimeError(...)",
    failedLaunchUnderlyingCause:
      "HTTPStatusError 404 Not Found for " +
      "https://huggingface.co/api/models/unsloth/gpt-oss-20b-unsloth-bnb-4bit/tree/main/" +
      "additional_chat_templates?recursive=false&expand=false, surfacing as " +
      "RemoteEntryNotFoundError, then the loader's own tokenizer/processor RuntimeError. A " +
      "transient Xet transport warning appears first, so the 404 may be a consequence of a partial " +
      "download rather than a genuinely absent folder. THIS IS NOT ESTABLISHED and must not be " +
      "asserted: distinguishing a hub-side absence from a transport-induced one requires a probe " +
      "that was not run.",
    failedLaunchProgressEvidence:
      "The run reached FURTHEST of the three attempts: pins loaded, 80 prompts loaded, all THREE " +
      "governed install stages completed (Stage 1, Stage 2, Stage 3), and " +
      "FastLanguageModel.from_pretrained was entered. It then failed inside model load.",
    failedLaunchDecisiveNegatives:
      "Neither `base loaded from` nor `BASE loaded` appears, so no model object was ever " +
      "constructed. Zero of eight inference markers appear.",
    failedLaunchLogRecords: 258,
    failedLaunchLogOffsetWindowSeconds: { from: 5.77, to: 213.47 },
    failedLaunchRuntimeSecondsDerivedNote:
      "Kaggle logs carry RELATIVE offsets only. The 213.47 s upper bound is the last relative log " +
      "offset, not wall-clock duration.",

    testInferenceOccurred: false,
    testInferenceOccurredEvidenceScript: "scripts/eval/verify-eval-failure-evidence.py",
    testInferenceOccurredEvidenceResult: "PASSED_4_OF_4_PRE_INFERENCE",
    testInferenceOccurredEvidenceDetail:
      "8 inference markers scanned and NONE present: torch.inference_mode, with torch.no_grad, " +
      ".generate(, model.generate(, EVALUATION_RUN_COMPLETE, predictions-base.jsonl, " +
      "predictions-candidate.jsonl, run-record.json.",

    // ---------------------------------------------------------------- the pattern, stated plainly
    launchAttempts: 3,
    defectClassesFound: 5,
    harnessRepairs: 2,
    metricValuesProduced: 0,
    attemptHistory: [
      {
        attempt: 1,
        kernelVersion: 1,
        decisionId: "DEC-0034",
        failedInCell: "cell 1",
        defectId: "DEF-0034-A",
        cause: "governed pins emitted as a raw JSON literal into Python source",
        reachedInstallStage: false,
        reachedModelLoad: false,
      },
      {
        attempt: 2,
        kernelVersion: 1,
        decisionId: "DEC-0035",
        failedInCell: "cell 5",
        defectId: "DEF-0035-D",
        cause:
          "pinned base revision passed as revision= to Unsloth's distribution repo id, where it is " +
          "dropped and leaves the load unsatisfiable",
        reachedInstallStage: true,
        reachedModelLoad: true,
      },
      {
        attempt: 3,
        kernelVersion: 3,
        decisionId: "DEC-0036",
        failedInCell: "cell 6",
        defectId: "DEF-0036-E",
        cause:
          "tokenizer/processor could not be loaded (404 on additional_chat_templates, possibly " +
          "transport-induced)",
        reachedInstallStage: true,
        reachedModelLoad: true,
      },
    ],
    progressIsReal:
      "Each attempt reached strictly further than the last. That is genuine progress and is " +
      "recorded as such. It is also completely orthogonal to the question the benchmark exists to " +
      "answer, and it produces no evidence about model quality.",
    whyThisIsNowAHumanQuestion:
      "Three pushes have consumed accelerator quota and produced zero measurements. Continuing " +
      "automatically would mean the harness decides how many failures are acceptable before anyone " +
      "re-examines the approach. The failure classes are converging on the model-loading path " +
      "specifically, which may indicate the 20B 4-bit load is not reproducible on this free-tier " +
      "runtime rather than merely mis-called.",

    // ---------------------------------------------------------------- explicitly NOT done
    repairsPerformedByThisRecord: 0,
    kernelPushedByThisRecord: false,
    fourthAttemptAuthorized: false,
    furtherAttemptRequiresNewHumanDecision: true,
    furtherAttemptRequiresNewHumanDecisionReason:
      "Authority to repair repeatedly was bounded by the pre-inference test and by the escalation " +
      "rule in DEC-0035. That rule is now triggered. A fourth push needs an explicit human decision, " +
      "and the CEO may reasonably decide instead to change the runtime, change the loader strategy, " +
      "or conclude the benchmark cannot be executed under the zero-cost mandate.",
    optionsPresentedToCEO: [
      "Authorize one further repair targeted specifically at the tokenizer/processor load path.",
      "Authorize a diagnostic probe run (no inference) that establishes whether the 404 is hub-side " +
        "or transport-induced, before any further repair.",
      "Change the runtime: the free-tier T4 path may not reproducibly load a 20B 4-bit model.",
      "Re-scope or postpone the benchmark, recording that no evaluation is possible under the " +
        "current zero-cost constraints.",
    ],
    optionsPresentedNote:
      "This record presents options; it does not recommend one. Choosing between them is the " +
      "decision the escalation exists to obtain.",

    // ---------------------------------------------------------------- identity of the artifact
    notebookSha256: observed.notebookSha256,
    launchBundleHash: observed.launchBundleHash,
    promptsSha256: "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333",
    candidateAdapterSha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
    baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
    loaderModelId: "unsloth/gpt-oss-20b",
    testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    testRecordCount: 80,
    harnessVersion: "gharibo-eval-harness-1.0.0",
    payloadBasis: "PROMPTS_ONLY",
    datasetVisibility: "PRIVATE",
    goldPayloadIncluded: false,
    goldPayloadAccessed: false,

    // ---------------------------------------------------------------- authorization accounting
    authorizationDecisionId: "DEC-0032",
    authorizationConsumed: true,
    authorizationSpent: false,
    authorizationSpentMeaning:
      "`consumed` means the single permitted execution has been committed to. `spent` would mean " +
      "TEST inference materially occurred, which hardStops[2] makes the test for a repeat. It has " +
      "NOT occurred in any of the three attempts, so the execution is consumed but not spent.",
    authorizationStateIsFragile: true,
    authorizationStateIsFragileReason:
      "The single execution remains technically unspent, but no fourth attempt is authorized. The " +
      "gap between 'technically unspent' and 'available to retry' is exactly the gap this record " +
      "refuses to close unilaterally.",
    hardStops2Satisfied: false,
    hardStops3Satisfied: true,
    hardStops3Note:
      "hardStops[3] requires an infrastructure/harness failure before TEST inference to be recorded " +
      "separately and NOT disguised as an evaluation result. This record is that separate record.",

    // ---------------------------------------------------------------- honesty at record time
    testRecordsParsedLocally: 0,
    predictionsDownloaded: false,
    scoringPerformed: false,
    evaluationStatus: "NOT_RUN",
    evaluationResults: 0,
    metricValuesRemainNull: true,

    // ---------------------------------------------------------------- standing state
    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",
    promotionPerformed: false,
    tuningPerformed: false,
    selectionPerformed: false,
    ghariboV01Created: false,

    note:
      "Third pre-inference failure. Recorded and escalated, not repaired. Five defect classes and " +
      "three kernel pushes have produced ZERO metric values, and the failures are converging on the " +
      "model-loading path rather than spreading randomly. The single authorized execution remains " +
      "technically unspent because no TEST inference has occurred, but this record does NOT " +
      "authorize a fourth attempt: the decision to continue, change runtime, or stop belongs to the " +
      "CEO. M1-M13 remain null.",

    references: [
      "governance/DEC-0032-evaluation-authorization.json",
      "governance/DEC-0034-evaluation-benchmark-launch.json",
      "governance/DEC-0035-evaluation-kernel-relaunch.json",
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
      "scripts/eval/verify-eval-failure-evidence.py",
    ],
  };
}

export function evaluationEscalationRecord() {
  const body = evaluationEscalationBody();
  return { ...body, escalationHash: sha256Canonical(body) };
}

export function render() {
  const ordered = evaluationEscalationBody();
  const record = evaluationEscalationRecord();
  const stable = { ...ordered, escalationHash: record.escalationHash };
  return JSON.stringify(stable, null, 2) + "\n";
}

export function escalationHash() {
  return evaluationEscalationRecord().escalationHash;
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`build-dec0036 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0036 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(
      `build-dec0036 --check: ${OUT_REL} is current (escalationHash ${escalationHash().slice(0, 12)}…)`,
    );
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision : DEC-0036 — ESCALATE, DO NOT REPAIR`);
  console.log(`  attempts : 3   defects: 5   metrics: 0`);
  console.log(`  escalationHash: ${escalationHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
