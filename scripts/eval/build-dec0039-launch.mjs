#!/usr/bin/env node
/**
 * build-dec0039-launch.mjs — deterministic generator for the DEC-0039 launch record.
 *
 * DEC-0039 records the ACTUAL push of evaluation attempt #4 under DEC-0038's authorization: one
 * kernel push of the governed bundle, BASE arm then CANDIDATE arm over the same 80 held-out TEST
 * records, on the DEC-0037 proven loading path.
 *
 * WHY THIS IS A SEPARATE RECORD FROM DEC-0038
 * -------------------------------------------
 * DEC-0038 is the AUTHORIZATION — permission, recorded before anything ran. This record is the
 * EXECUTION — proof that the permitted push happened, with the exact artifact bytes that were
 * pushed. Keeping them separate is what lets a reader tell "we were allowed to" apart from "we did",
 * and it is what pins the run to a specific notebook hash rather than to a moving file.
 *
 * THIS RECORD IS NOT AN EVALUATION RESULT
 * ---------------------------------------
 * It records that inference STARTED. It does not contain, imply, or approximate a metric value.
 * M1-M13 stay null here. Whether attempt #4 produces a result or dies pre-inference is a LATER
 * record; this one deliberately does not prejudge it.
 *
 * Usage:
 *   node scripts/eval/build-dec0039-launch.mjs          # write the record
 *   node scripts/eval/build-dec0039-launch.mjs --check  # exit 1 if stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0039-evaluation-attempt-4-launch.json";

const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-eval-001.ipynb";
const BUNDLE_REL = "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json";

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
    throw new Error(`build-dec0039: ${NOTEBOOK_REL} is missing`);
  }
  if (!existsSync(resolve(ROOT, BUNDLE_REL))) {
    throw new Error(`build-dec0039: ${BUNDLE_REL} is missing — build the bundle before recording`);
  }
  const notebookSha256 = sha256File(NOTEBOOK_REL);
  const plan = JSON.parse(readFileSync(resolve(ROOT, BUNDLE_REL), "utf8"));
  const launchBundleHash = plan.launchBundleHash;
  // The bundle is the thing that was pushed. If the notebook on disk and the bundle disagree, the
  // record would pin a hash that no launch ever used — refuse rather than write a false identity.
  if (plan.notebookSha256 !== notebookSha256) {
    throw new Error(
      `build-dec0039: notebook/bundle disagree (${notebookSha256} vs ${plan.notebookSha256}) — ` +
        "rebuild the bundle before generating the record",
    );
  }
  return { notebookSha256, launchBundleHash, plan };
}

export function launchBody() {
  const { notebookSha256, launchBundleHash } = observedIdentities();
  return {
    status: "EVALUATION_ATTEMPT_4_LAUNCHED",
    decisionId: "DEC-0039",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0038",
    recordKind: "BENCHMARK_LAUNCH_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T07:45:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision:
      "PUSH EXACTLY ONCE, UNDER DEC-0038'S AUTHORIZATION, THE GOVERNED ATTEMPT-#4 EVALUATION KERNEL",
    decisionBasis:
      "DEC-0038 authorized exactly one governed execution. This record is that execution's launch.",
    recordBasis: "docs/EVALUATION_BENCHMARK_LAUNCH.md",

    // ---------------------------------------------------------------- the push
    authorizationDecisionId: "DEC-0038",
    authorizationHashUsed: "c4de32b1ca03711ee310ac4e9d9da7bcace53978cc482a5d9760d38d38622497",
    attemptNumber: 4,
    maximumKernelPushesAuthorized: 1,
    kernelPushesPerformedByThisRecord: 1,
    kernelPushesRemaining: 0,
    kernelId: "vokaigharibo/gharibo-eval-001-fec22ca2",
    kernelVersionPushed: 3,
    kernelStatusObservedAfterPush: "KernelWorkerStatus.RUNNING",
    kernelUrl: "https://www.kaggle.com/code/vokaigharibo/gharibo-eval-001-fec22ca2",
    launchOutcome: "IN_FLIGHT",

    notebookSha256AsPushed: notebookSha256,
    launchBundleHashAsPushed: launchBundleHash,
    promptsSha256: "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333",
    bundleVerificationChecks: 19,
    kernelSafetyChecks: 57,

    // ---------------------------------------------------------------- the contract being run
    arms: ["base", "candidate"],
    armOrder: "BASE_THEN_CANDIDATE",
    sameTestRecordsForBothArms: true,
    testSplitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    testRecordCount: 80,
    datasetHash: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
    harnessVersion: "gharibo-eval-harness-1.0.0",
    payloadBasis: "PROMPTS_ONLY",
    goldPayloadIncluded: false,
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

    // ---------------------------------------------------------------- the proven path, reused
    loaderConvention:
      "FastLanguageModel.from_pretrained(model_name='unsloth/gpt-oss-20b', max_seq_length=1024, " +
      "dtype=None, load_in_4bit=True) with NO revision= argument.",
    loaderConventionProvenBy: "DEC-0037",
    loaderRedesignAttempted: false,
    additionalChatTemplates404Status: "REPRODUCED_AND_NON_FATAL",

    // ---------------------------------------------------------------- honesty at record time
    testInferenceOccurred: "IN_FLIGHT_NOT_YET_ESTABLISHED",
    testInferenceNote:
      "The kernel is RUNNING. Whether TEST inference materially occurs is not established at record " +
      "time and is deliberately NOT claimed. Under DEC-0038, if inference begins the authorization " +
      "is SPENT.",
    testRecordsParsedLocally: 0,
    predictionsDownloaded: false,
    scoringPerformed: false,
    metricValuesProduced: 0,
    evaluationStatus: "NOT_RUN",
    evaluationResults: 0,
    metricValuesRemainNull: true,
    metricValuesAreNotPlaceholders:
      "M1-M13 are null here. This record is a launch, not a result: it produces no measurement and " +
      "asserts none.",

    // ---------------------------------------------------------------- rules that now bind
    authorizationSpentOnInferenceStart: true,
    candidateSettingsNotAlterableAfterBaseOutput: true,
    retryOnPoorResultAuthorized: false,
    tuningAuthorized: false,
    selectionAuthorized: false,
    promotionPerformedOrAuthorized: false,
    ghariboV01Created: false,
    onPreInferenceFailure:
      "Prove the failure from logs and markers, record it, reconcile governance, commit and push the " +
      "evidence, and STOP. No repair-and-retry and no attempt #5 without a further explicit human " +
      "decision.",

    // ---------------------------------------------------------------- standing state
    trainingStatusUnchanged: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",

    note:
      "Attempt #4 is IN FLIGHT. ONE push was performed under DEC-0038's ONE-push bound and zero " +
      "pushes remain. The run uses the DEC-0037 proven loading path unchanged, BASE then CANDIDATE " +
      "over the same 80 held-out TEST records, with decoding identical across arms. No metric value " +
      "exists at record time and none is estimated. If inference begins the authorization is SPENT " +
      "and the run is never repeated for a poor result; if it dies pre-inference the failure is " +
      "proven, recorded and STOPPED.",

    references: [
      "governance/DEC-0038-evaluation-attempt-4-authorization.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "governance/DEC-0036-evaluation-escalation.json",
      "docs/EVALUATION_BENCHMARK_LAUNCH.md",
      "docs/RESEARCH_BENCHMARK.md",
      "apps/web/data/kaggle-eval/gharibo-eval-001/launch-plan.json",
    ],
  };
}

export function launchRecord() {
  const body = launchBody();
  return { ...body, launchHash: sha256Canonical(body) };
}

export function render() {
  const ordered = launchBody();
  const record = launchRecord();
  return JSON.stringify({ ...ordered, launchHash: record.launchHash }, null, 2) + "\n";
}

export function launchHash() {
  return launchRecord().launchHash;
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`build-dec0039 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0039 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(
      `build-dec0039 --check: ${OUT_REL} is current (launchHash ${launchHash().slice(0, 12)}…)`,
    );
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision : DEC-0039 — attempt #4 LAUNCHED (one push, zero remaining)`);
  console.log(`  kernel   : vokaigharibo/gharibo-eval-001-fec22ca2 v3 (IN FLIGHT)`);
  console.log(`  launchHash: ${launchHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
