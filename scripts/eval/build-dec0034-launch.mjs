#!/usr/bin/env node
/**
 * build-dec0034-launch.mjs — deterministic generator for the DEC-0034 record.
 *
 * DEC-0034 records that the authorization granted by DEC-0032 was EXERCISED: the governed Kaggle
 * evaluation kernel was pushed and began running, after the DEC-0033 infrastructure blocker was
 * cleared (the generator defects were repaired, commit `b29c043`) and the prompts-only launch
 * bundle passed an 19-check privacy verification.
 *
 * WHY THIS RECORD EXISTS
 * ----------------------
 * DEC-0032 hardStops[2] draws a line that this record must respect:
 *
 *   "If TEST inference has materially occurred, the run MUST NOT be repeated merely because
 *    scores are disappointing."
 *
 * Once the kernel is RUNNING, the single authorized execution is COMMITTED. That state change is
 * itself a material governance fact, and it has to be recorded at the moment it happens — not
 * reconstructed later from a run log. Hence this record, written while the kernel is still in
 * flight.
 *
 * WHAT THIS RECORD DOES *NOT* CLAIM
 *   - it does NOT report a result. At record time no prediction file had been downloaded and no
 *     score had been computed. Every M1-M13 value stays null;
 *   - it does NOT mark evaluation complete, and it does NOT increment evaluationResults;
 *   - it does NOT assert the run will succeed. A launch is not an outcome. If the kernel later
 *     fails, that failure must be recorded as a FAILED EXECUTION, never back-filled as a score;
 *   - it does NOT promote, tune, select, or create GHARIBO-V0.1.
 *
 * A NOTE ON `authorizationConsumed`
 *   It flips to true here, and that is deliberate and narrow. It means "the one permitted
 *   benchmark execution has been started and may not be re-run for convenience". It does NOT mean
 *   the authorization was satisfied, and it does NOT license a second attempt. If this run fails
 *   before producing valid predictions, resuming it requires a new human decision — precisely
 *   because the alternative (retrying until the numbers look acceptable) is test-set fitting.
 *
 * DETERMINISM
 * ----------
 * The body is a pure constant: no clock, no filesystem, no environment. `recordedAt` is a fixed
 * literal so the record hash is stable across runs and machines. Volatile facts (the kernel's
 * live status) are recorded as of `recordedAt` and labelled as such.
 *
 * Usage:
 *   node scripts/eval/build-dec0034-launch.mjs          # write governance/DEC-0034-*.json
 *   node scripts/eval/build-dec0034-launch.mjs --check  # exit 1 if the file is stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0034-evaluation-benchmark-launch.json";

const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";
const BUNDLE_REL = "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json";

/**
 * Identity facts are read from the artifacts they describe rather than retyped here. A launch
 * record that quotes a notebook hash the notebook no longer has is worse than no record: it reads
 * as evidence while pointing at nothing.
 */
export function observedIdentities() {
  const bundle = JSON.parse(readFileSync(resolve(ROOT, BUNDLE_REL), "utf8"));
  const notebookSha256 = createHash("sha256")
    .update(readFileSync(resolve(ROOT, NOTEBOOK_REL)))
    .digest("hex");
  if (bundle.notebookSha256 && bundle.notebookSha256 !== notebookSha256) {
    throw new Error(
      `build-dec0034: notebook/bundle disagree (${bundle.notebookSha256.slice(0, 12)} vs ` +
        `${notebookSha256.slice(0, 12)}) — rebuild the bundle before generating the record`,
    );
  }
  return {
    notebookSha256,
    launchBundleHash: bundle.launchBundleHash,
    promptsSha256: bundle.promptsSha256,
  };
}

/** Canonical form: object keys sorted recursively (the repo-wide hash convention). */
export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

/** The DEC-0034 launch body, minus its own hash. */
export function evaluationLaunchBody() {
  const observed = observedIdentities();
  return {
    // ---------------------------------------------------------------- identity
    status: "EVALUATION_BENCHMARK_LAUNCHED",
    decisionId: "DEC-0034",
    supersedesDecisionId: null,
    recordKind: "BENCHMARK_LAUNCH_NOT_AN_EVALUATION_RESULT",

    recordedAt: "2026-09-16T01:00:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision: "AUTHORIZED BENCHMARK EXECUTION LAUNCHED",
    recordBasis: "docs/EVALUATION_BENCHMARK_LAUNCH.md",

    /**
     * This launch FAILED, pre-inference, and that outcome is recorded here rather than left to a
     * separate quietly-absent place. The failure was a defect in the harness, not in the model,
     * and it was repaired and relaunched under DEC-0035. Both facts belong to this record: a
     * launch whose outcome is omitted reads as a success.
     */
    launchOutcome: "FAILED_PRE_INFERENCE",
    failureClass: "HARNESS_DEFECT_NO_EXECUTION",
    failurePhase: "CELL_1_PIN_LOADING",
    failureException: "NameError",
    failureMessage: "name 'false' is not defined",
    failureDiagnosis:
      "The generator emitted the governed pins as a RAW JSON LITERAL into Python source " +
      "(`PINS = {... \"doSample\": false ...}`). JSON and Python disagree on true/false/null, so " +
      "cell 1 raised NameError at 9.58 s of relative log time. The run died before the install " +
      "stage and before any model was loaded.",
    failureEvidence: "derived deterministically by scripts/eval/verify-eval-failure-evidence.py",
    failureEvidenceResult: "PASSED_4_OF_4_PRE_INFERENCE",
    supersedingLaunchId: "DEC-0035",
    repairedByCommit: "RECORDED_IN_DEC-0035",
    testInferenceOccurredDuringFailedLaunch: false,
    testRecordsParsedDuringFailedLaunch: 0,
    metricValuesProducedDuringFailedLaunch: 0,
    authorizationSpentByFailedLaunch: false,
    authorizationSpentByFailedLaunchReason:
      "DEC-0032 hardStops[2] forbids a re-run only where TEST inference has materially occurred. " +
      "The failed launch never loaded a model, never read a TEST record and produced no prediction " +
      "byte, so the condition does not hold and the single authorized execution remains unspent.",

    // ------------------------------------------------------- what cleared the blocker
    blockerClearedId: "BLK-0004",
    blockerClearedByDecisionId: "DEC-0033",
    blockerClearingCommit: "b29c043",
    blockerClearingSummary:
      "The two kernel-generator defects named in DEC-0033 were repaired: the ad-hoc %pip sequence " +
      "was replaced with the accepted three-stage governed uv discipline, and the direct " +
      "apply_chat_template tensor call was replaced with the frozen render-then-tokenize " +
      "convention (the standing instruction also moved from a system turn to a developer turn, " +
      "matching the governed representation). A 41-check kernel-safety gate was added and " +
      "verified by adversarial injection.",

    // ------------------------------------------------------- what was launched
    worker: "kaggle",
    accelerator: "NvidiaTeslaT4",
    kernelId: "vokaigharibo/gharibo-eval-001-fec22ca2",
    kernelVersion: 1,
    kernelUrl: "https://www.kaggle.com/code/vokaigharibo/gharibo-eval-001-fec22ca2",
    kernelStatusAtRecordTime: "RUNNING",
    kernelStatusSource: "kaggle kernels status (observed at recordedAt; a launch-time fact, not a result)",
    kernelSupersedesId: "vokaigharibo/gharibo-eval-001",
    kernelSupersedesReason:
      "The first kernel id carried the defective pins cell. The repaired notebook was pushed under " +
      "a new id whose title slug resolves to it, because Kaggle rejects a push whose title does not " +
      "resolve to the declared id.",
    datasetId: "vokaigharibo/gharibo-eval-prompts-fec22ca2",
    datasetVisibility: "PRIVATE",

    // ------------------------------------------------------- what the payload contained
    payloadBasis: "PROMPTS_ONLY",
    promptsSha256: observed.promptsSha256,
    notebookSha256: observed.notebookSha256,
    launchBundleHash: observed.launchBundleHash,
    identityNote:
      "notebookSha256 and launchBundleHash are read from the committed notebook and launch plan at " +
      "generation time, so this record cannot quote an artifact it does not match. The values here " +
      "are the REPAIRED artifact (the one pushed after the DEF-0035-D repair); the defective " +
      "notebook that this launch actually ran is identified by its own hash below.",
    notebookSha256AsRan: "ec0d45ecf51b46d2ebe6f73fa4cdada938990f8cee0915cb41979bd9e277eab4",
    launchBundleHashAsRan: "5eb5e2dc00f33a679c566b20b1211245c186bc4a9d793bbf2307b1e770d39645",
    bundleVerificationChecks: 19,
    bundleVerificationResult: "PASSED",
    kernelSafetyChecks: 53,
    kernelSafetyResult: "PASSED",
    kernelSafetyChecksAtLaunchTime: 41,
    kernelRuntimeChecks: 22,
    kernelRuntimeResult: "PASSED",
    failureEvidenceChecks: 4,
    failureEvidenceResult: "PASSED",
    kernelRuntimeResult: "PASSED",
    goldPayloadIncluded: false,
    goldPayloadAccessed: false,
    trainSplitIncluded: false,
    validationSplitIncluded: false,
    testPayloadIncluded: false,
    testPayloadUsage: "PROMPTS_ONLY_AT_INFERENCE_GOLD_HELD_LOCALLY",

    // ------------------------------------------------------- arms and identity
    arms: ["base", "candidate"],
    armOrder: "BASE_THEN_CANDIDATE",
    armOrderRationale:
      "The benchmark specification requires BASE to run first. Running CANDIDATE alone, or " +
      "reordering, would depart from the frozen design.",
    candidateAdapterSha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
    baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
    testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    testRecordCount: 80,
    harnessVersion: "gharibo-eval-harness-1.0.0",

    // ------------------------------------------------------- authorization accounting
    authorizationDecisionId: "DEC-0032",
    authorizationConsumed: true,
    authorizationConsumedMeaning:
      "The ONE permitted benchmark execution has been STARTED. It does not mean the authorization " +
      "was satisfied, and it does not license a second attempt. A re-run after this launch " +
      "requires a new human decision.",
    reasonToRunRatherThanStop:
      "The sole remaining blocker was the absence of an execution environment, not any " +
      "unresolved design question. Once a GPU route existed and the generator was repaired and " +
      "privacy-verified, executing the authorized benchmark was the next required step.",
    rerunRequiresNewDecision: true,
    rerunRationale:
      "DEC-0032 hardStops[2]: if TEST inference has materially occurred the run must not be " +
      "repeated merely because scores are disappointing. Retrying until the numbers look " +
      "acceptable is test-set fitting.",

    // ------------------------------------------------------- honesty at record time
    testInferenceOccurred: "POSSIBLY_IN_FLIGHT",
    testRecordsParsedLocally: 0,
    metricValuesProduced: 0,
    predictionsDownloaded: false,
    scoringPerformed: false,
    evaluationStatusUnchanged: "EVALUATION_AUTHORIZED_READINESS",
    evaluationResultsUnchanged: 0,

    // ------------------------------------------------------- standing state
    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",
    promotionPerformed: false,
    tuningPerformed: false,
    selectionPerformed: false,
    secondAttemptAuthorized: false,

    note:
      "This record marks a LAUNCH, not an outcome. The first attempt failed pre-inference on a " +
      "harness defect and is recorded as such; the repaired notebook was pushed under DEC-0035 and " +
      "is in flight. No prediction file had been downloaded and no score had been computed when " +
      "this record was written. M1-M13 remain null until real inference output is retrieved and " +
      "scored locally. Neither the failure nor the relaunch is evidence that the benchmark " +
      "succeeded, and the kernel's live RUNNING status is a launch-time observation, not a result.",

    references: [
      "governance/DEC-0032-evaluation-authorization.json",
      "governance/DEC-0033-evaluation-infrastructure-blocker.json",
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/EVALUATION_EXECUTION_BLOCKER.md",
      "docs/RESEARCH_BENCHMARK.md",
    ],
  };
}

export function evaluationLaunchRecord() {
  const body = evaluationLaunchBody();
  return { ...body, launchHash: sha256Canonical(body) };
}

export function render() {
  const ordered = evaluationLaunchBody();
  const record = evaluationLaunchRecord();
  const stable = { ...ordered, launchHash: record.launchHash };
  return JSON.stringify(stable, null, 2) + "\n";
}

export function launchHash() {
  return evaluationLaunchRecord().launchHash;
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`build-dec0034 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0034 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-dec0034 --check: ${OUT_REL} is current (launchHash ${launchHash().slice(0, 12)}…)`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision     : DEC-0034`);
  console.log(`  kernel       : vokaigharibo/gharibo-eval-001 (v1)`);
  console.log(`  launchHash   : ${launchHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
