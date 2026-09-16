#!/usr/bin/env node

import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";

import { createHash } from "node:crypto";

import {
  isEvaluationAttempt6AuthorizedGoldState,
} from "../../apps/web/lib/training/gold-authorization.mjs";

const AUTH =
  "governance/DEC-0046-evaluation-attempt-6-authorization.json";

const MASTER =
  "governance/GHARIBO_MASTER_STATE.json";

const NOTEBOOK =
  "scripts/eval/kaggle/gharibo-eval-002.ipynb";

const PLAN =
  "apps/web/data/kaggle-eval/gharibo-eval-002/launch-plan.json";
const RECONCILIATION = "governance/DEC-0047-attempt-6-artifact-reconciliation.json";
const BUNDLE = "apps/web/data/kaggle-eval/gharibo-eval-002";

const failures = [];

function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    failures.push(
      `${label}${detail ? ` — ${detail}` : ""}`
    );
    console.error(
      `FAIL  ${label}${detail ? ` — ${detail}` : ""}`
    );
  }
}

function canonical(value) {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          (key) => [key, canonical(value[key])]
        ),
    );
  }

  return value;
}

function sha256File(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

for (const path of [
  AUTH,
  MASTER,
  NOTEBOOK,
  PLAN,
  RECONCILIATION,
]) {
  check(`${path} exists`, existsSync(path));
}

if (
  !existsSync(AUTH) ||
  !existsSync(MASTER) ||
  !existsSync(NOTEBOOK) ||
  !existsSync(PLAN) || !existsSync(RECONCILIATION)
) {
  process.exit(1);
}

const auth =
  JSON.parse(readFileSync(AUTH, "utf8"));

const state =
  JSON.parse(readFileSync(MASTER, "utf8"));

const plan =
  JSON.parse(readFileSync(PLAN, "utf8"));
const reconciliation = JSON.parse(readFileSync(RECONCILIATION, "utf8"));
const { reconciliationHash, ...reconciliationBody } = reconciliation;
check("DEC-0047 exact reconciliation hash is valid",
  createHash("sha256").update(JSON.stringify(canonical(reconciliationBody))).digest("hex") === reconciliationHash &&
  reconciliationHash === "0d78ec1a55df0a0d12b3485c87012b1c616a3915f89560e6f8354d9bc51b3243" &&
  state.training?.attempt6ArtifactReconciliation?.reconciliationHash === reconciliationHash);
check("DEC-0047 preserves DEC-0046 authorization and reconciles only its artifact",
  reconciliation.authorizationHash === auth.authorizationHash && reconciliation.previousLaunchBundleHash === auth.launchBundleHash &&
  reconciliation.attemptNumber === 6 && reconciliation.newEvaluationAttempt === false &&
  reconciliation.additionalKernelPushesAuthorized === 0 && reconciliation.executionInThisTaskPermitted === false &&
  reconciliation.notebookBytesChanged === false && reconciliation.evaluationSemanticsChanged === false);
const metadata = JSON.parse(readFileSync(`${BUNDLE}/kernel/kernel-metadata.json`, "utf8"));
const sources = [auth.datasetId, "vokaigharibo/gharibo-exp-001-adapter-fec22ca2"];
check("private kernel attaches exactly the prompts and accepted adapter datasets",
  JSON.stringify(metadata.dataset_sources) === JSON.stringify(sources) && metadata.is_private === true &&
  ["competition_sources", "kernel_sources", "model_sources"].every(k => Array.isArray(metadata[k]) && metadata[k].length === 0));
const adapter = reconciliation.adapterDataset;
check("private adapter identity and independently verified minimal package are governed",
  adapter?.datasetId === sources[1] && adapter.visibility === "PRIVATE" && adapter.remoteDownloadVerified === true &&
  adapter.exactlyOneAdapterDirectory === true && adapter.remoteStatus === "ready" &&
  JSON.stringify(adapter.files?.map(f => f.path)) === JSON.stringify(["adapter_config.json", "adapter_model.safetensors"]) &&
  adapter.files[1].sha256 === auth.candidateAdapterSha256 && reconciliation.candidateAdapterSha256 === auth.candidateAdapterSha256 &&
  plan.candidateAdapterSha256 === auth.candidateAdapterSha256 && plan.adapterDatasetId === sources[1]);
check("prompts dataset contains exactly metadata and prompts, with no gold/test/train/validation payload",
  JSON.stringify(readdirSync(`${BUNDLE}/dataset`).sort()) === JSON.stringify(["dataset-metadata.json", "prompts.jsonl"]));
check("kernel upload contains only notebook and metadata",
  JSON.stringify(readdirSync(`${BUNDLE}/kernel`).sort()) === JSON.stringify(["gharibo-eval-002.ipynb", "kernel-metadata.json"]));
const payload = ["dataset/dataset-metadata.json", "dataset/prompts.jsonl", "kernel/gharibo-eval-002.ipynb", "kernel/kernel-metadata.json"];
const computedBundle = createHash("sha256").update(payload.map(p => `${sha256File(`${BUNDLE}/${p}`)}  ${p}`).sort().join("\n") + "\n").digest("hex");
check("actual payload bytes match the reconciled bundle and frozen notebook/prompts",
  computedBundle === reconciliation.launchBundleHash && computedBundle === plan.launchBundleHash &&
  sha256File(`${BUNDLE}/kernel/gharibo-eval-002.ipynb`) === auth.notebookSha256 &&
  sha256File(`${BUNDLE}/dataset/prompts.jsonl`) === auth.promptsSha256);
check("all pre-launch counters preserve one push, zero performed, no inference or retry",
  [plan, reconciliation, state.training?.attempt6Authorization, state.training?.attempt6ArtifactReconciliation].every(r =>
    r?.maximumKernelPushes === 1 && r.kernelPushesPerformed === 0 && r.kernelPushesRemaining === 1 &&
    r.testInferenceOccurred === false && r.automaticRetryAuthorized === false));

const {
  authorizationHash,
  ...body
} = auth;

const computed =
  createHash("sha256")
    .update(
      JSON.stringify(canonical(body))
    )
    .digest("hex");

check(
  "DEC-0046 authorization hash is valid",
  computed === authorizationHash &&
  authorizationHash ===
    "3afac20d638e033c13d875381b97005891d3946f3ba2ac336b04093b287bca93",
);

check(
  "Attempt #6 is exactly one push",
  auth.attemptNumber === 6 &&
  auth.maximumKernelPushes === 1 &&
  auth.automaticRetryAuthorized === false,
);

check(
  "bound notebook bytes are exact",
  sha256File(NOTEBOOK) ===
    "eebd832d771467b8e468b8dbba946b7b7ff3e202f31ae52b6d76c2f1a7b0f48e",
);

check(
  "launch bundle identity is exact",
  plan.launchBundleHash ===
    "1d98de8ad3d0342232bb653bb4e78889565f9b6a7a49ab41ece13171cf68867e",
);

check(
  "prompts identity is exact",
  plan.promptsSha256 ===
    "dcea32df3697921322afc33eae856bf6fd4e111785f63c4d399de7077e43f333",
);

check(
  "plan is prepared but not launched",
  plan.status === "PREPARED_NOT_LAUNCHED" &&
  plan.authorizationDecisionId === "DEC-0046" &&
  plan.attemptNumber === 6 &&
  plan.maximumKernelPushes === 1 &&
  plan.launchAttempted === false &&
  plan.testInferenceOccurred === false &&
  plan.metricValuesProduced === 0,
);

check(
  "gold payload remains excluded",
  plan.goldPayloadIncluded === false &&
  plan.testPayloadIncluded === false,
);

check(
  "master state version is 1.26.0",
  state.masterStateVersion === "1.26.0",
);

check(
  "gold governance predicate accepts Attempt #6 authorization",
  isEvaluationAttempt6AuthorizedGoldState(state),
);

check(
  "no evaluation result exists",
  state.training?.evaluationResults === 0 &&
  state.experiments?.["GHARIBO-exp-001"]?.evaluationStatus ===
    "NOT_RUN",
);

check(
  "candidate remains unpromoted",
  state.experiments?.["GHARIBO-exp-001"]?.promotable ===
    false,
);

const v01 =
  (state.models?.derivedModels || [])
    .find(
      (m) => m?.id === "GHARIBO-V0.1"
    );

check(
  "GHARIBO-V0.1 remains NOT_CREATED",
  v01?.status === "NOT_CREATED",
);

if (failures.length) {
  console.error("");
  console.error(
    `ATTEMPT #6 AUTHORIZATION GATE: FAILED (${failures.length})`
  );

  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }

  process.exit(1);
}

console.log("");
console.log(
  "ATTEMPT #6 AUTHORIZATION GATE: PASSED"
);
console.log(
  "KAGGLE PUSHES AUTHORIZED: 1"
);
console.log(
  "KAGGLE PUSHES PERFORMED: 0"
);
console.log(
  "TEST INFERENCE EXECUTED: NO"
);
console.log(
  "PROMOTION AUTHORIZED: NO"
);
