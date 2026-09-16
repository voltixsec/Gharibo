#!/usr/bin/env node
/**
 * build-dec0042-preflight.mjs (governance record) — deterministic generator for the DEC-0042
 * LOCAL-SNAPSHOT preflight authorization.
 *
 * DEC-0042 authorizes ONE NO-INFERENCE Kaggle preflight kernel push to prove the LOCAL
 * IMMUTABLE SNAPSHOT model-loading architecture. It explicitly states:
 * ATTEMPT #5 IS NOT AUTHORIZED.
 *
 * This is NOT an evaluation authorization. It does not attach TEST, prompts, gold, adapters,
 * or any inference primitive. It proves ONLY:
 *   1. install succeeds;
 *   2. snapshot download succeeds and the returned path is a valid local directory;
 *   3. required config/tokenizer/model-index files exist in the snapshot;
 *   4. tokenizer loads;
 *   5. BASE model loads from the LOCAL SNAPSHOT PATH with local_files_only=True;
 *   6. no mutable `main` resolution is observed during or after the load;
 *   7. no TEST data is accessed;
 *   8. no inference is executed.
 *
 * Usage:
 *   node scripts/eval/build-dec0042-record.mjs          # write the record
 *   node scripts/eval/build-dec0042-record.mjs --check   # exit 1 if stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { notebookSha256, IMMUTABLE_DISTRIBUTION_REVISION, DISTRIBUTION_REPO } from "./build-dec0042-preflight.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0042-preflight-authorization.json";
const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-preflight-002.ipynb";

export const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value;

export const sha256Canonical = (value) =>
  createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export function preflightBody() {
  const nbSha = notebookSha256();

  return {
    status: "LOCAL_SNAPSHOT_PREFLIGHT_BLOCKED",
    decisionId: "DEC-0042",
    supersedesDecisionId: null,
    amendsDecisionId: "DEC-0041",
    recordKind: "PREFLIGHT_AUTHORIZATION_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T11:30:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision:
      "AUTHORIZE ONE NO-INFERENCE KAGGLE PREFLIGHT KERNEL PUSH TO PROVE THE LOCAL " +
      "IMMUTABLE SNAPSHOT MODEL-LOADING ARCHITECTURE. ATTEMPT #5 IS NOT AUTHORIZED.",
    decisionBasis:
      "DEC-0041 successfully executed snapshot_download at the immutable SHA but " +
      "DISCARDED the returned local path. The production loader was then called with " +
      "the repo id 'unsloth/gpt-oss-20b', which allowed Hub resolution to occur again " +
      "and hit tree/main/additional_chat_templates (404 at 'main', fatal). DEC-0042 " +
      "closes that gap: the actual model loader MUST receive the returned LOCAL " +
      "SNAPSHOT DIRECTORY, not a repo id. The primary invariant is: THE LOADER " +
      "RECEIVES A LOCAL DIRECTORY, NOT A REPO ID.",

    // What this IS
    authorizes: "ONE private Kaggle NO-INFERENCE preflight kernel push",
    maximumKernelPushes: 1,
    kernelPushesPerformed: 1,
    kernelPushesRemaining: 0,
    retryAuthorized: false,
    automaticRetryAuthorized: false,

    // What this is NOT
    attempt5Authorized: false,
    evaluationAttempt5Authorized: false,
    evaluationAuthorized: false,
    testDataAttached: false,
    testDataAccessAuthorized: false,
    inferenceAuthorized: false,
    generationAuthorized: false,
    promotionAuthorized: false,
    metricsAuthorized: false,
    tuningAuthorized: false,
    modelSelectionAuthorized: false,
    ghariboV01CreationAuthorized: false,
    datasetMutationAuthorized: false,
    testDrivenCodeOptimisationAuthorized: false,

    // The preflight design
    preflightScope: "INSTALL → VERSION DIAGNOSTICS → BASE REVISION ASSERTION → SNAPSHOT DOWNLOAD → SEAL NETWORK → LOCAL MODEL LOAD → IDENTITY/REVISION ASSERTIONS → CLEAN EXIT",
    preflightStopsBefore: "INFERENCE — no model.generate(), no prompts, no gold, no adapter, no scoring",
    preflightRequiredMarkers: [
      "PREFLIGHT3_SNAPSHOT_PASS",
      "PREFLIGHT3_LOCAL_PATH_PASS",
      "PREFLIGHT3_TOKENIZER_PASS",
      "PREFLIGHT3_MODEL_LOAD_PASS",
      "PREFLIGHT3_DISTRIBUTION_REVISION_PASS",
      "PREFLIGHT3_NO_MUTABLE_MAIN",
      "PREFLIGHT3_TEST_ACCESS_NO",
      "PREFLIGHT3_INFERENCE_NO",
      "PREFLIGHT3_COMPLETE",
    ],
    preflightAlsoPrints: [
      "OBSERVED_DISTRIBUTION_ID=",
      "OBSERVED_DISTRIBUTION_REVISION=",
      "SNAPSHOT_DIR=",
      "ACTUAL_LOADER_INPUT=",
    ],

    // The target invariant
    targetInvariant:
      "The actual model loader receives the returned LOCAL SNAPSHOT DIRECTORY, " +
      "not a repo id. The snapshot is downloaded at the immutable SHA " +
      "093fba6992ef5a7152481afec0bdfca1ac486998. local_files_only=True prevents " +
      "any network resolution. FAIL CLOSED if the observed revision is 'main' or " +
      "if any Hub call occurs after sealing.",
    immutableDistributionRevision: IMMUTABLE_DISTRIBUTION_REVISION,
    distributionRepo: DISTRIBUTION_REPO,
    mutableRefThatMustNotResolve: "main",

    // The architecture
    architecture: "LOCAL_IMMUTABLE_SNAPSHOT",
    primaryInvariant: "THE LOADER RECEIVES A LOCAL DIRECTORY, NOT A REPO ID",
    phase1Download: "snapshot_download(repo_id, revision) → CAPTURE returned path",
    phase2SealNetwork: "HF_HUB_OFFLINE=1 + TRANSFORMERS_OFFLINE=1 (defense-in-depth, NOT primary)",
    phase3Load: "FastLanguageModel.from_pretrained(model_name=SNAPSHOT_DIR, local_files_only=True)",

    // Preventive hardening (carried from DEC-0041)
    xetHardening: "HF_HUB_DISABLE_XET=1 (preventive, not causal — recorded explicitly)",
    preDownloadMechanism: "huggingface_hub.snapshot_download at the immutable revision (CAPTURED, not discarded)",

    // Production loader shared
    productionLoaderSharedWithPreflight: true,
    sharedCodeSource: "scripts/eval/build-eval-kernel.mjs (install cell + base-revision cell extracted verbatim)",

    // Standing state (unchanged)
    evaluationStatus: "NOT_RUN",
    evaluationResults: 0,
    trainingStatus: "COMPLETED",
    candidateStatusUnchanged: "EXPERIMENTAL_UNPROMOTED",
    ghariboV01StatusUnchanged: "NOT_CREATED",
    metricValuesProduced: 0,
    metricValuesRemainNull: true,

    // Authorization accounting
    authorizationSpent: true,
    authorizationConsumed: true,
    authorizationState: "PREFLIGHT_AUTHORIZED_AND_SPENT",

    // The preflight kernel
    notebookSha256: nbSha,
    notebookPath: NOTEBOOK_REL,
    kernelId: "vokaigharibo/gharibo-preflight-002",
    kernelPrivate: true,
    enableGpu: true,
    enableInternet: true,
    accelerator: "NvidiaTeslaT4",

    // Execution (filled in after the push)
    execution: {
      status: "BLOCKED",
      kernelPushes: 1,
      kernelStatus: "ERROR",
      install: true,
      versionDiagnostics: {
        transformers: "4.56.2",
        huggingface_hub: "0.36.2",
        unsloth: "2026.9.4",
        unsloth_zoo: "2026.9.3",
        mroDiagnosticCompleted: false,
        mroDiagnosticError: "ImportError: cannot import name 'HfHubHTTPError' from 'huggingface_hub' (v0.36.2)",
      },
      snapshotDownload: false,
      snapshotLocalPath: null,
      tokenizer: false,
      modelLoad: false,
      observedDistributionId: null,
      observedDistributionRevision: null,
      actualLoaderInput: null,
      mutableMainObserved: null,
      testAttached: false,
      testAccessed: false,
      inferenceExecuted: false,
      markersVerified: [
        "PREFLIGHT3_TEST_ACCESS_NO",
      ],
      failurePhase: "VERSION_DIAGNOSTIC",
      failureException: "ImportError",
      failureRootCause:
        "cannot import name 'HfHubHTTPError' from 'huggingface_hub' (v0.36.2). " +
        "The exception class is not re-exported from the top-level huggingface_hub package. " +
        "The diagnostic cell (cell 5) crashed at 'from huggingface_hub import HfHubHTTPError' " +
        "before the snapshot download (Phase 1) or model load (Phase 3) could run. " +
        "The install succeeded (all three governed stages completed). " +
        "Version diagnostics partially printed: transformers 4.56.2, huggingface_hub 0.36.2, " +
        "unsloth 2026.9.4, unsloth_zoo 2026.9.3. " +
        "The diagnostic cell has been fixed to use dynamic import with fallback paths " +
        "(huggingface_hub.errors) but the ONE authorized push was already consumed. " +
        "The local-snapshot architecture was NOT tested by execution. " +
        "The production loader has been modified to share the architecture based on " +
        "DEC-0041 root cause analysis and code inspection, not on a successful execution.",
      identifiedFix:
        "The diagnostic cell now uses dynamic import: __import__ with fromlist and " +
        "getattr fallback across huggingface_hub and huggingface_hub.errors. " +
        "This is NOT monkey-patching — it is fixing a diagnostic import path. " +
        "A second push is NOT authorized.",
      noSecondPushAuthorized: true,
      attempt5Authorized: false,
    },

    references: [
      "governance/DEC-0041-preflight-authorization.json",
      "governance/DEC-0040-evaluation-attempt-4-failure.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "scripts/eval/build-dec0042-preflight.mjs",
      "scripts/eval/check-dec0042-preflight.mjs",
      "scripts/eval/verify-dec0042-preflight-runtime.py",
      "docs/RESEARCH_BENCHMARK.md",
    ],
  };
}

export function preflightRecord() {
  const body = preflightBody();
  return { ...body, authorizationHash: sha256Canonical(body) };
}

export function render() {
  const ordered = preflightBody();
  const record = preflightRecord();
  return JSON.stringify({ ...ordered, authorizationHash: record.authorizationHash }, null, 2) + "\n";
}

export function authorizationHash() {
  return preflightRecord().authorizationHash;
}

function main() {
  const check = process.argv.includes("--check");
  const out = resolve(ROOT, OUT_REL);
  const text = render();

  if (check) {
    if (!existsSync(out)) {
      console.error(`build-dec0042-record --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0042-record --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-dec0042-record --check: ${OUT_REL} is current (hash ${authorizationHash().slice(0, 12)})`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision : DEC-0042 — LOCAL-SNAPSHOT PREFLIGHT`);
  console.log(`  attempt #5: NOT AUTHORIZED`);
  console.log(`  immutable rev: ${IMMUTABLE_DISTRIBUTION_REVISION}`);
  console.log(`  dist repo    : ${DISTRIBUTION_REPO}`);
  console.log(`  authorizationHash: ${authorizationHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
