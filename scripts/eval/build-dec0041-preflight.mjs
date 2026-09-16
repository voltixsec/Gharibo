#!/usr/bin/env node
/**
 * build-dec0041-preflight.mjs — deterministic generator for the DEC-0041 preflight authorization.
 *
 * DEC-0041 authorizes ONE NO-INFERENCE Kaggle preflight kernel push to prove the production
 * model-loading path is stable before a future evaluation is authorized. It explicitly states:
 * ATTEMPT #5 IS NOT AUTHORIZED.
 *
 * This is NOT an evaluation authorization. It does not attach TEST, prompts, gold, adapters,
 * or any inference primitive. It proves ONLY:
 *   1. install succeeds;
 *   2. tokenizer loads;
 *   3. BASE model loads;
 *   4. the distribution resolves to the immutable SHA (NOT `main`);
 *   5. no TEST data is accessed;
 *   6. no inference is executed.
 *
 * Usage:
 *   node scripts/eval/build-dec0041-preflight.mjs          # write the record
 *   node scripts/eval/build-dec0041-preflight.mjs --check   # exit 1 if stale
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { notebookSha256, IMMUTABLE_DISTRIBUTION_REVISION } from "./build-preflight-kernel.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_REL = "governance/DEC-0041-preflight-authorization.json";
const NOTEBOOK_REL = "scripts/eval/kaggle/gharibo-preflight-001.ipynb";

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
    status: "NO_INFERENCE_PREFLIGHT_AUTHORIZED",
    decisionId: "DEC-0041",
    supersedesDecisionId: null,
    amendsDecisionId: null,
    recordKind: "PREFLIGHT_AUTHORIZATION_NOT_AN_EVALUATION_RESULT",
    recordRevision: 1,

    recordedAt: "2026-09-16T10:00:00.000Z",
    recorderRole: "Delivery Director",
    recordDate: "2026-09-16",
    decision:
      "AUTHORIZE ONE NO-INFERENCE KAGGLE PREFLIGHT KERNEL PUSH TO PROVE THE PRODUCTION " +
      "MODEL-LOADING PATH IS STABLE. ATTEMPT #5 IS NOT AUTHORIZED.",
    decisionBasis:
      "DEC-0040 recorded that attempt #4 failed pre-inference at MODEL_LOAD because the " +
      "distribution resolved to the mutable ref 'main' instead of the immutable commit SHA " +
      "093fba6992ef5a7152481afec0bdfca1ac486998. DEC-0037 proved the same load SUCCEEDS at " +
      "the pinned SHA. This preflight exercises the SAME production loader code with " +
      "preventive hardening (HF_HUB_DISABLE_XET=1 + pre-download at the immutable revision) " +
      "to prove the load is stable before a future evaluation is authorized.",

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
    preflightScope: "INSTALL → TOKENIZER → BASE MODEL LOAD → IDENTITY/REVISION ASSERTIONS → CLEAN EXIT",
    preflightStopsBefore: "INFERENCE — no model.generate(), no prompts, no gold, no adapter, no scoring",
    preflightRequiredMarkers: [
      "PREFLIGHT_INSTALL_PASS",
      "PREFLIGHT_TOKENIZER_PASS",
      "PREFLIGHT_MODEL_LOAD_PASS",
      "PREFLIGHT_DISTRIBUTION_ID_PASS",
      "PREFLIGHT_DISTRIBUTION_REVISION_PASS",
      "PREFLIGHT_BASE_REVISION_PASS",
      "PREFLIGHT_TEST_ACCESS_NO",
      "PREFLIGHT_INFERENCE_NO",
      "PREFLIGHT_COMPLETE",
    ],
    preflightAlsoPrints: ["OBSERVED_DISTRIBUTION_ID=", "OBSERVED_DISTRIBUTION_REVISION="],

    // The target invariant
    targetInvariant:
      "The production loader resolves the distribution to the immutable SHA " +
      "093fba6992ef5a7152481afec0bdfca1ac486998, NOT to 'main'. FAIL CLOSED if the observed " +
      "revision is anything except the immutable SHA.",
    immutableDistributionRevision: IMMUTABLE_DISTRIBUTION_REVISION,
    mutableRefThatMustNotResolve: "main",

    // Preventive hardening
    xetHardening: "HF_HUB_DISABLE_XET=1 (preventive, not causal — recorded explicitly)",
    preDownloadMechanism: "huggingface_hub.snapshot_download at the immutable revision",

    // Production loader shared
    productionLoaderSharedWithPreflight: true,
    sharedCodeSource: "scripts/eval/build-eval-kernel.mjs (install cell + model-load call extracted verbatim)",

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
    kernelId: "vokaigharibo/gharibo-preflight-001",
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
      tokenizer: false,
      modelLoad: false,
      observedDistributionId: null,
      observedDistributionRevision: null,
      expectedRevision: IMMUTABLE_DISTRIBUTION_REVISION,
      mutableMainObserved: true,
      testAttached: false,
      testAccessed: false,
      inferenceExecuted: false,
      markersVerified: [
        "PREFLIGHT_TEST_ACCESS_NO",
      ],
      failurePhase: "TOKENIZER_LOAD",
      failureException: "RuntimeError",
      failureRootCause:
        "The transformers library list_repo_templates function makes an HTTP request to " +
        "tree/main/additional_chat_templates regardless of the cached revision. " +
        "The 404 is non-fatal at the pinned commit revision (DEC-0037 proved this) but " +
        "FATAL at main. The pre-download cached the distribution at the immutable SHA, " +
        "but the tokenizer code path still resolves to main for the additional_chat_templates " +
        "lookup because it uses the default revision='main'.",
      identifiedFix:
        "Set HF_HUB_OFFLINE=1 AFTER snapshot_download and BEFORE the loader call to " +
        "force the transformers library to use the local HF cache instead of making " +
        "live requests to the main ref. The error message itself suggests this: " +
        "'set HF_HUB_OFFLINE=1 to force local loading.'",
      noSecondPushAuthorized: true,
      attempt5Authorized: false,
    },

    references: [
      "governance/DEC-0040-evaluation-attempt-4-failure.json",
      "governance/DEC-0037-diagnostic-authorization.json",
      "governance/DEC-0036-evaluation-escalation.json",
      "scripts/eval/build-preflight-kernel.mjs",
      "scripts/eval/check-preflight-kernel.mjs",
      "scripts/eval/verify-preflight-kernel-runtime.py",
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
      console.error(`build-dec0041 --check: ${OUT_REL} does not exist`);
      process.exit(1);
    }
    if (readFileSync(out, "utf8") !== text) {
      console.error(`build-dec0041 --check: ${OUT_REL} is stale — regenerate it`);
      process.exit(1);
    }
    console.log(`build-dec0041 --check: ${OUT_REL} is current (hash ${authorizationHash().slice(0, 12)}…)`);
    process.exit(0);
  }

  writeFileSync(out, text, "utf8");
  console.log(`wrote ${OUT_REL}`);
  console.log(`  decision : DEC-0041 — NO-INFERENCE PREFLIGHT`);
  console.log(`  attempt #5: NOT AUTHORIZED`);
  console.log(`  immutable rev: ${IMMUTABLE_DISTRIBUTION_REVISION}`);
  console.log(`  authorizationHash: ${authorizationHash()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
