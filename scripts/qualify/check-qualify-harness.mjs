#!/usr/bin/env node
/**
 * check-qualify-harness.mjs — verifies the rendered Kaggle qualification harness.
 *
 * The harness cannot be executed here (no Kaggle, no GPU), so this script enforces
 * — mechanically, from the committed .ipynb — the properties that must hold before
 * it is shipped to the CTO:
 *
 *   1. the .ipynb is well-formed and its embedded content address round-trips;
 *   2. the injected inventory still matches `PINNED_ENGINE_DEPENDENCIES` /
 *      `UNSLOTH_ENGINE_VERSION` / `BASE_MODEL_*` / `LOADER_MODEL_ID` and the declared
 *      recipe defaults in apps/web/lib/training/package.ts (no drift);
 *   3. the inventory pre-fills NO version and NO SHA (never fabricate);
 *   4. the emitted artifact conforms to docs/ENV_QUALIFICATION_CONTRACT.md v1.5.0
 *      (§3 top level, §4 records, §5 environment, §6 reproducibility, §7 unknowns,
 *      §8 status, §9 content address, §10 self-validation, §14 model compatibility);
 *   5. the T4/Turing constraints are encoded (sm_75 floor, fp16, no bf16, no FA2,
 *      TORCH_CUDA_ARCH_LIST=7.5);
 *   6. the harness stays TRAINING-free: no trainer, no optimizer construction/step,
 *      no backward pass, no scheduler, no parameter update and no model artifact
 *      write appears in the generated notebook (contract §13). Loading a model and
 *      running a forward pass is REQUIRED and is therefore allowed;
 *   7. the harness performs the full real model-compatibility sequence against
 *      `openai/gpt-oss-20b` and emits every mission-mandated artifact field (§14);
 *   8. the harness exercises a REAL GHARIBO example and embeds none of the dataset;
 *   9. no secret-shaped literal and no secret-reading code path is present;
 *  10. cell-order: every user-defined function called in any cell is defined in
 *      an earlier cell (or earlier in the same cell) before the call — prevents
 *      the "probe_environment NameError" class of generated-notebook ordering
 *      defect.
 * 11. install observability: the dependency-install step must capture full
 *      stdout+stderr, persist a redacted diagnostic artifact on failure, and
 *      include the resolver reason in the exception.  A dry-run probe must
 *      run before mutating the environment.  No -qqq on install commands.
 *
 * Run: node scripts/qualify/check-qualify-harness.mjs
 * Exits 1 on any failing group; prints every failure it finds.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readEngineVersion,
  readModelIdentity,
  readPinnedEngineDependencies,
  readQualificationLoraDefaults,
  readRecipeDefaults,
} from "./qualify-kaggle-env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const p = (...parts) => path.join(ROOT, ...parts);

const NOTEBOOK_PATH = p("scripts", "qualify", "qualify-kaggle-env.ipynb");
const PACKAGE_TS = p("apps", "web", "lib", "training", "package.ts");
const CONTRACT_DOC = p("docs", "ENV_QUALIFICATION_CONTRACT.md");
const MASTER_STATE_JSON = p("governance", "GHARIBO_MASTER_STATE.json");
const DATASET_DIR = p("data", "processed", "gharibo-research-gold-v0.1");

/** Artifact schema version this harness targets (contract §3, `contract_schema_version`). */
const CONTRACT_SCHEMA_VERSION = "1.1.0";
/** Document version of docs/ENV_QUALIFICATION_CONTRACT.md this checker mirrors. */
const CONTRACT_DOC_VERSION = "1.5.0";

/** Every dependency the harness must resolve and record (Milestone 3A §A + §E promotion). */
const REQUIRED_PINNED = [
  "unsloth",
  "unsloth_zoo",
  "transformers",
  "torch",
  "triton",
  "triton_kernels",
  // §4.5 promoted direct recipe deps (6→12)
  "peft",
  "trl",
  "datasets",
  "accelerate",
  "bitsandbytes",
  "openai-harmony",
];
const REQUIRED_ADDITIONAL = ["torchao", "tokenizers", "huggingface-hub"];
const REQUIRED_HARMONY_CANDIDATES = [];

/** Contract §3: the top-level keys the emitted record must carry. */
const REQUIRED_TOP_LEVEL = [
  "contract_schema_version",
  "harness_version",
  "experiment_id",
  "git_commit_sha",
  "package_id",
  "engine",
  "captured_at",
  "status",
  "dependencies",
  "environment",
  "reproducibility",
  "unknowns",
  "warnings",
  "qualification_hash",
];

/** Contract §14.3: every key the mission's artifact list requires inside `model_compatibility`. */
const REQUIRED_MODEL_KEYS = [
  "qualification_only",
  "gpu",
  "vram",
  "cuda",
  "driver",
  "compute_capability",
  "python_version",
  "dependency_versions",
  "dependency_revisions",
  "base_model",
  "base_model_revision",
  "tokenizer_loaded",
  "harmony_verified",
  "real_example_tokenized",
  "model_loaded",
  "qlora_initialized",
  "batch_collated",
  "forward_dry_run_completed",
  "total_parameters",
  "trainable_parameters",
  "trainable_percentage",
  "vram_before_load",
  "vram_after_load",
  "vram_after_adapter_init",
  "peak_vram",
  "artifact_destination_writable",
  "optimizer_created",
  "backward_executed",
  "optimizer_step_executed",
  "training_loop_executed",
  "model_parameters_updated",
  "parameter_digest_before",
  "parameter_digest_after",
  // Correction 1: TRAIN-ONLY fixture fields
  "qualification_fixture_source",
  "test_data_accessed",
  // Correction 2: generic GPU detection fields
  "gpu_count",
  "gpu_models",
  "vram_per_gpu",
  "total_visible_vram",
  "multi_gpu_used_by_loader",
  // Correction 3: output hygiene guard
  "output_hygiene_verified",
  // Correction 4: no auto-freeze
  "auto_freeze_applied",
  "experiment_authorized",
];

/** The status vocabulary the artifact must emit (contract §8 + §14.5). */
const STATUS_VOCABULARY = ["QUALIFIED", "PARTIAL", "FAILED", "QUALIFICATION_FAILED_MEASURED"];

/** Strings that must NOT appear: they would mean the harness trains or writes artifacts.
 *
 * MATCHING RULE: this is a CONSERVATIVE raw-substring scan over the generated
 * notebook's cell sources (comments and string literals included). It is safe to be
 * strict because the harness authors its prose and its runtime tripwires to avoid
 * these literal forms: the tripwire code assembles the same names from concatenated
 * fragments (e.g. 'back' + 'ward', 'lr_' + 'scheduler'), so the forbidden invocation
 * shapes never appear in the notebook text even though the harness patches them at
 * run time. A match is therefore always a genuine primitive, never a
 * false positive on a comment or a doc string.
 *
 * NOTE (v2.0.0): model LOADING is no longer forbidden — the qualification now has to
 * prove real gpt-oss-20b compatibility, so `from_pretrained`, the tokenizer, the
 * Unsloth loader and the forward pass are required. Everything that would TRAIN or
 * that would write a model artifact stays forbidden. */
const FORBIDDEN_TOKENS = [
  // Trainers and training loops (contract §13).
  "SFTTrainer",
  "SFTConfig",
  "Trainer(",
  "TrainingArguments(",
  "trainer.train(",
  ".train(",
  // Optimizer construction / steps / schedulers.
  "optimizer.step(",
  ".step()",
  "torch.optim.",
  "torch.optim.Optimizer(",
  "optim.AdamW",
  "lr_scheduler",
  "get_scheduler",
  // Backward passes and gradient enabling.
  "loss.backward(",
  ".backward()",
  "torch.autograd.backward(",
  "autograd.grad(",
  "accelerator.backward(",
  "requires_grad_(",
  "enable_grad",
  // Model artifacts are never written by a qualification run.
  "push_to_hub",
  "save_pretrained",
  // No Kaggle Secret and no HF token: both models are public / ungated.
  "kaggle_secrets",
  "UserSecretsClient",
  "HF_TOKEN",
  "hf_token",
];

/** Placeholder shapes that would indicate a fabricated version. */
const PLACEHOLDER_PATTERNS = [
  { label: "x-placeholder", re: /\b\d+\.\d+\.x\b/ },
  { label: "TODO", re: /\bTODO\b/ },
  { label: "FIXME", re: /\bFIXME\b/ },
  { label: "PLACEHOLDER", re: /\bPLACEHOLDER\b/ },
];

const SECRET_SHAPES = [
  { label: "hf token", re: /\bhf_[A-Za-z0-9]{20,}\b/ },
  { label: "github pat", re: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/ },
  { label: "openai key", re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { label: "inline credentials", re: /https?:\/\/[^/\s:@]+:[^/\s@]+@/ },
];

const failures = [];
const notes = [];

function fail(group, message) {
  failures.push(`[${group}] ${message}`);
}

// ---------------------------------------------------------------------------
// 0. Load
// ---------------------------------------------------------------------------

if (!fs.existsSync(NOTEBOOK_PATH)) {
  console.error(`missing ${path.relative(ROOT, NOTEBOOK_PATH)} — run: node scripts/qualify/qualify-kaggle-env.mjs`);
  process.exit(1);
}
const rawNotebook = fs.readFileSync(NOTEBOOK_PATH, "utf8");

let notebook;
try {
  notebook = JSON.parse(rawNotebook);
} catch (err) {
  console.error(`notebook is not valid JSON: ${err.message}`);
  process.exit(1);
}

const cellSources = (notebook.cells ?? []).map((c) =>
  Array.isArray(c.source) ? c.source.join("") : String(c.source ?? ""),
);
const notebookSource = cellSources.join("\n");

// ---------------------------------------------------------------------------
// 1. Structure + content address
// ---------------------------------------------------------------------------

if (notebook.nbformat !== 4) fail("structure", `nbformat is ${notebook.nbformat}, expected 4`);
if (!Array.isArray(notebook.cells) || notebook.cells.length === 0) fail("structure", "notebook has no cells");
for (const [i, cell] of (notebook.cells ?? []).entries()) {
  if (cell.cell_type !== "code") fail("structure", `cell ${i} is ${cell.cell_type}, expected code`);
  if (cell.execution_count !== null) fail("structure", `cell ${i} has a non-null execution_count`);
  if (!Array.isArray(cell.outputs) || cell.outputs.length !== 0) fail("structure", `cell ${i} carries outputs`);
  if (typeof cell.id !== "string" || cell.id.length === 0) fail("structure", `cell ${i} has no stable id`);
}
for (const sentinel of ["__GHARIBO_QUALIFY_INVENTORY_JSON__", "__GHARIBO_HARNESS_SHA256__", "__GHARIBO_ENGINE_VERSION__"]) {
  if (rawNotebook.includes(sentinel)) fail("structure", `unsubstituted template sentinel remains: ${sentinel}`);
}

const shaMatch = notebookSource.match(/HARNESS_CONTENT_SHA256 = '([0-9a-f]{64}|)'/);
if (!shaMatch) {
  fail("structure", "HARNESS_CONTENT_SHA256 is missing from the notebook");
} else if (!shaMatch[1]) {
  fail("structure", "HARNESS_CONTENT_SHA256 is blank in the committed notebook");
} else {
  const blanked = rawNotebook.split(shaMatch[1]).join("");
  const recomputed = createHash("sha256").update(blanked, "utf8").digest("hex");
  if (recomputed !== shaMatch[1]) {
    fail("structure", `content address does not round-trip (embedded ${shaMatch[1]}, recomputed ${recomputed})`);
  } else {
    notes.push(`content address ${shaMatch[1]}`);
  }
}

// ---------------------------------------------------------------------------
// 2. Inventory vs the repo's real pins
// ---------------------------------------------------------------------------

const inventoryMatch = cellSources[1]?.match(/INVENTORY = json\.loads\(r'''([\s\S]*?)'''\)/);
if (!inventoryMatch) fail("inventory", "could not locate the injected INVENTORY blob in cell 1");
let inventory = { pinned_dependencies: [], additional_dependencies: [], harmony_candidates: [] };
if (inventoryMatch) {
  try {
    inventory = JSON.parse(inventoryMatch[1]);
  } catch (err) {
    fail("inventory", `injected INVENTORY is not valid JSON: ${err.message}`);
  }
}

const pkgSource = fs.readFileSync(PACKAGE_TS, "utf8");
// Reuse the generator's parser so the checker can never drift from the renderer.
let pinned = [];
try {
  pinned = readPinnedEngineDependencies();
} catch (err) {
  fail("inventory", `could not parse PINNED_ENGINE_DEPENDENCIES from ${path.relative(ROOT, PACKAGE_TS)}: ${err.message}`);
}

let engineVersion = null;
try {
  engineVersion = readEngineVersion();
} catch (err) {
  fail("inventory", `could not parse UNSLOTH_ENGINE_VERSION from package.ts: ${err.message}`);
}

const pinnedByName = new Map(inventory.pinned_dependencies.map((d) => [d.name, d]));
for (const dep of pinned) {
  const entry = pinnedByName.get(dep.name);
  if (!entry) {
    fail("inventory", `package.ts pins "${dep.name}" but the harness does not probe it`);
    continue;
  }
  if (entry.source !== dep.source) fail("inventory", `${dep.name}: source ${entry.source} != package.ts ${dep.source}`);
  if (entry.requested_spec !== dep.spec) {
    fail("inventory", `${dep.name}: requested_spec "${entry.requested_spec}" != package.ts spec "${dep.spec}"`);
  }
  if ((entry.url ?? null) !== dep.url) fail("inventory", `${dep.name}: url ${entry.url} != package.ts ${dep.url}`);
  if (entry.pinned_in_package_ts !== true) fail("inventory", `${dep.name}: pinned_in_package_ts should be true`);
  if (!entry.install) fail("inventory", `${dep.name}: no install argument`);
}

// Contract §4.3 rule 1: dependencies[] must be EXACTLY the pinned set.
if (inventory.pinned_dependencies.length !== pinned.length) {
  fail("inventory", `pinned_dependencies has ${inventory.pinned_dependencies.length} entries, package.ts has ${pinned.length}`);
}
for (const name of REQUIRED_PINNED) {
  if (!pinnedByName.has(name)) fail("inventory", `required pinned dependency "${name}" is missing`);
}

const additionalNames = new Set(inventory.additional_dependencies.map((d) => d.name));
for (const name of REQUIRED_ADDITIONAL) {
  if (!additionalNames.has(name)) fail("inventory", `required additional dependency "${name}" is missing`);
}
for (const dist of REQUIRED_HARMONY_CANDIDATES) {
  if (!inventory.harmony_candidates.some((c) => c.dist === dist)) {
    fail("inventory", `Harmony candidate "${dist}" is missing`);
  }
}
// Regression guard for the M2 defect: the triton_kernels package lives in a
// subdirectory of the triton monorepo, so the spec must carry the fragment.
const tritonKernels = pinnedByName.get("triton_kernels");
if (tritonKernels && !tritonKernels.requested_spec.includes("#subdirectory=python/triton_kernels")) {
  fail("inventory", "package.ts triton_kernels spec is missing the #subdirectory=python/triton_kernels fragment");
}
if (tritonKernels && !tritonKernels.fragment) {
  fail("inventory", "the triton_kernels inventory entry has no frozen-spec fragment");
}
if (inventory.contract_schema_version !== CONTRACT_SCHEMA_VERSION) {
  fail("inventory", `contract_schema_version ${inventory.contract_schema_version} != ${CONTRACT_SCHEMA_VERSION}`);
}
if (!/^\d+\.\d+\.\d+$/.test(inventory.harness_version ?? "")) {
  fail("inventory", `harness_version "${inventory.harness_version}" is not semver`);
}
if (!inventory.experiment_id) fail("inventory", "experiment_id is missing");

// v4 regression: cross-list name uniqueness between dependencies[] and
// additional_dependencies[]. A dependency name must appear in exactly ONE class.
{
  const pinnedNamesSet = new Set(inventory.pinned_dependencies.map((d) => d.name));
  const additionalNamesList = inventory.additional_dependencies.map((d) => d.name);
  for (const name of additionalNamesList) {
    if (pinnedNamesSet.has(name)) {
      fail("inventory", `cross-list violation: "${name}" appears in both pinned_dependencies[] and additional_dependencies[]`);
    }
  }
}

// v4 regression: huggingface-hub>=0.34.0,<1.0 must be in the resolver input
// (additional_dependencies with the correct spec).
{
  const hfh = inventory.additional_dependencies.find((d) => d.name === "huggingface-hub");
  if (!hfh) {
    fail("inventory", "huggingface-hub is missing from additional_dependencies[]");
  } else if (hfh.requested_spec !== "huggingface-hub>=0.34.0,<1.0" || hfh.install !== "huggingface-hub>=0.34.0,<1.0") {
    fail("inventory", `huggingface-hub spec drift: expected "huggingface-hub>=0.34.0,<1.0", got "${hfh.requested_spec}"`);
  }
}

// v4 regression: openai-harmony must be in dependencies[] (pinned) and NOT in
// additional_dependencies[] (no duplication).
{
  const inPinned = inventory.pinned_dependencies.some((d) => d.name === "openai-harmony");
  const inAdditional = inventory.additional_dependencies.some((d) => d.name === "openai-harmony");
  if (!inPinned) fail("inventory", "openai-harmony must be in pinned_dependencies[] (governed by PINNED_ENGINE_DEPENDENCIES)");
  if (inAdditional) fail("inventory", "openai-harmony must NOT be in additional_dependencies[] (cross-list duplication)");
}

// ---------------------------------------------------------------------------
// 2b. Model identity, recipe defaults and dataset facts vs their real sources
// ---------------------------------------------------------------------------

const modelCompatibility = inventory.model_compatibility ?? {};
const datasetInventory = inventory.dataset ?? {};

function expectEqual(label, actual, expected) {
  if (actual !== expected) fail("inventory", `${label}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}

let identity = null;
let recipe = null;
let loraDefaults = null;
try {
  identity = readModelIdentity();
} catch (err) {
  fail("inventory", `could not read the model identity from package.ts: ${err.message}`);
}
try {
  recipe = readRecipeDefaults();
} catch (err) {
  fail("inventory", `could not read the recipe defaults from package.ts: ${err.message}`);
}
try {
  loraDefaults = readQualificationLoraDefaults();
} catch (err) {
  fail("inventory", `could not read the LoRA defaults from run-form.tsx: ${err.message}`);
}

if (identity) {
  expectEqual("model_compatibility.base_model", modelCompatibility.base_model, identity.baseModel);
  expectEqual("model_compatibility.expected_base_model_revision",
    modelCompatibility.expected_base_model_revision, identity.baseModelRevision);
  expectEqual("model_compatibility.loader_model", modelCompatibility.loader_model, identity.loaderModel);
}
if (recipe) {
  expectEqual("model_compatibility.dtype", modelCompatibility.dtype, recipe.defaultDtype);
  expectEqual("model_compatibility.max_seq_length", modelCompatibility.max_seq_length, recipe.defaultSequenceLength);
  expectEqual("model_compatibility.min_max_seq_length", modelCompatibility.min_max_seq_length, recipe.minSequenceLength);
  expectEqual("model_compatibility.batch_size", modelCompatibility.batch_size, recipe.defaultBatchSize);
  expectEqual("model_compatibility.gradient_accumulation_steps",
    modelCompatibility.gradient_accumulation_steps, recipe.defaultGradAccum);
  expectEqual("model_compatibility.lora.dropout", modelCompatibility.lora?.dropout, recipe.defaultLoraDropout);
  expectEqual("model_compatibility.lora.bias", modelCompatibility.lora?.bias, recipe.defaultLoraBias);
  expectEqual("model_compatibility.harmony.reasoning_effort",
    modelCompatibility.harmony?.reasoning_effort, recipe.harmony.reasoningEffort);
  expectEqual("model_compatibility.harmony.developer_template_id",
    modelCompatibility.harmony?.developer_template_id, recipe.harmony.developerTemplateId);
  if (JSON.stringify(modelCompatibility.harmony?.hidden_channels) !== JSON.stringify(recipe.harmony.hiddenChannels)) {
    fail("inventory", "model_compatibility.harmony.hidden_channels does not match DEFAULT_HARMONY in package.ts");
  }
}
if (loraDefaults) {
  expectEqual("model_compatibility.lora.r", modelCompatibility.lora?.r, loraDefaults.r);
  expectEqual("model_compatibility.lora.alpha", modelCompatibility.lora?.alpha, loraDefaults.alpha);
  expectEqual("model_compatibility.seed", modelCompatibility.seed, loraDefaults.seed);
  if (JSON.stringify(modelCompatibility.lora?.target_modules) !== JSON.stringify(loraDefaults.targetModules)) {
    fail("inventory", `model_compatibility.lora.target_modules ${JSON.stringify(modelCompatibility.lora?.target_modules)} `
      + `!= the run-form.tsx default ${JSON.stringify(loraDefaults.targetModules)}`);
  }
}
expectEqual("model_compatibility.loader_quantization", modelCompatibility.loader_quantization, "4-bit");
expectEqual("model_compatibility.load_in_4bit", modelCompatibility.load_in_4bit, true);
expectEqual("model_compatibility.full_finetuning", modelCompatibility.full_finetuning, false);
expectEqual("model_compatibility.use_gradient_checkpointing",
  modelCompatibility.use_gradient_checkpointing, "unsloth");

// The dataset binding must match the committed master state exactly: the notebook
// verifies the operator-supplied corpus against these hashes before using one line.
let masterDatasets = null;
try {
  masterDatasets = JSON.parse(fs.readFileSync(MASTER_STATE_JSON, "utf8")).datasets ?? {};
} catch (err) {
  fail("inventory", `could not read ${path.relative(ROOT, MASTER_STATE_JSON)}: ${err.message}`);
}
if (masterDatasets) {
  const entry = masterDatasets[datasetInventory.id];
  if (!entry) {
    fail("inventory", `dataset id "${datasetInventory.id}" is not a datasets key in the master state`);
  } else {
    expectEqual("dataset.dataset_hash", datasetInventory.dataset_hash, entry.hashes?.datasetHash);
    expectEqual("dataset.split_hashes.train", datasetInventory.split_hashes?.train, entry.hashes?.splitHashes?.train);
    expectEqual("dataset.split_hashes.validation", datasetInventory.split_hashes?.validation, entry.hashes?.splitHashes?.validation);
    expectEqual("dataset.split_hashes.test", datasetInventory.split_hashes?.test, entry.hashes?.splitHashes?.test);
    expectEqual("dataset.version", datasetInventory.version, entry.version);
    expectEqual("dataset.example_count", datasetInventory.example_count, entry.exampleCount);
    expectEqual("dataset.split_seed", datasetInventory.split_seed, entry.split?.seed);
    expectEqual("dataset.example_split", datasetInventory.example_split, "train");
  }
}
// Correction 1: TRAIN-ONLY fixture — only train.jsonl is expected.
if (!Array.isArray(datasetInventory.expected_split_files)
  || datasetInventory.expected_split_files.length !== 1
  || datasetInventory.expected_split_files[0] !== "train.jsonl") {
  fail("inventory", "dataset.expected_split_files must list only [\"train.jsonl\"] (TRAIN-ONLY fixture)");
}
if (datasetInventory.expected_split_files.includes("validation.jsonl")
  || datasetInventory.expected_split_files.includes("test.jsonl")) {
  fail("inventory", "expected_split_files must NOT include validation or test — TRAIN_ONLY fixture");
}
if (datasetInventory.qualification_fixture_source !== "TRAIN_ONLY") {
  fail("inventory", "dataset.qualification_fixture_source must be \"TRAIN_ONLY\"");
}
if (datasetInventory.test_data_accessed !== false) {
  fail("inventory", "dataset.test_data_accessed must be false");
}

// ---------------------------------------------------------------------------
// 3. Nothing pre-resolved (never fabricate a version or SHA)
// ---------------------------------------------------------------------------

for (const dep of [...inventory.pinned_dependencies, ...inventory.additional_dependencies]) {
  for (const key of ["resolved_version", "resolvedVersion", "resolved_commit"]) {
    if (key in dep) {
      fail("no-fabrication", `${dep.name}: inventory pre-fills ${key} (must be resolved at run time)`);
    }
  }
}
// Guard against a runtime back-fill of the inventory as well as a static one.
// The only sanctioned assignment target is the record being assembled.
for (const key of ["resolved_version", "resolved_commit"]) {
  const re = new RegExp(`(?<!record)\\[['"]${key}['"]\\]\\s*=`);
  if (re.test(notebookSource)) {
    fail("no-fabrication", `the harness assigns ${key} to something other than the assembled record`);
  }
}
for (const { label, re } of PLACEHOLDER_PATTERNS) {
  const hit = notebookSource.match(re);
  if (hit) fail("no-fabrication", `placeholder ${label} found in the harness: "${hit[0]}"`);
}

// ---------------------------------------------------------------------------
// 4. Contract conformance (docs/ENV_QUALIFICATION_CONTRACT.md v1.5.0)
// ---------------------------------------------------------------------------

if (!fs.existsSync(CONTRACT_DOC)) {
  fail("contract", `missing ${path.relative(ROOT, CONTRACT_DOC)} — the harness targets that contract`);
} else {
  // The checker and the contract document must not drift apart.
  const docText = fs.readFileSync(CONTRACT_DOC, "utf8");
  const docVersion = docText.match(/^\|\s*\*\*Version\*\*\s*\|\s*([0-9]+\.[0-9]+\.[0-9]+)\s*\|/m);
  if (!docVersion) {
    fail("contract", `${path.relative(ROOT, CONTRACT_DOC)} has no **Version** metadata row`);
  } else if (docVersion[1] !== CONTRACT_DOC_VERSION) {
    fail("contract", `${path.relative(ROOT, CONTRACT_DOC)} is v${docVersion[1]} but this checker mirrors `
      + `v${CONTRACT_DOC_VERSION} — update both together`);
  }
  if (!docText.includes(CONTRACT_SCHEMA_VERSION)) {
    fail("contract", `${path.relative(ROOT, CONTRACT_DOC)} never mentions artifact schema ${CONTRACT_SCHEMA_VERSION}`);
  }
  for (const section of ["## 14.", "QUALIFICATION_FAILED_MEASURED", "model_compatibility"]) {
    if (!docText.includes(section)) {
      fail("contract", `${path.relative(ROOT, CONTRACT_DOC)} is missing the model-compatibility contract text: ${section}`);
    }
  }
}

const contractChecks = [
  ["artifact filename", /env-qualification\.json/],
  ["canonical writer (sorted keys, no whitespace)", /json\.dumps\(value, sort_keys=True, separators=\(',', ':'\), ensure_ascii=False\)/],
  ["UTF-8 / no BOM write", /encoding='utf-8', newline='\\n'/],
  ["§3 top-level keys", /'contract_schema_version': CONTRACT_SCHEMA_VERSION/],
  ["§3 git_commit_sha literal", /'git_commit_sha': 'unknown'/],
  ["§3 package_id null", /'package_id': None/],
  ["§3 engine block", /'engine': \{'engine': ENGINE, 'engine_version': ENGINE_VERSION\}/],
  ["§4.0 frozen pip spec", /return '%s==%s' % \(dep\['name'\], version\) if version else None/],
  ["§4.0 frozen git spec", /return 'git\+%s@%s%s' % \(dep\['url'\] or '', commit, dep\['fragment'\] or ''\)/],
  ["§4.0 fallback to requested_spec", /'spec': frozen if frozen else dep\['requested_spec'\]/],
  ["§4.1 requested_spec audit key", /'requested_spec': dep\['requested_spec'\]/],
  ["§4.1 git resolved_version is the commit", /\(raw\.get\('commit_sha'\) or None\) if dep\['source'\] == 'git'/],
  ["§4.1 installer recorded", /'installer': 'uv'/],
  ["§4.1 git always carries resolved_commit", /record\['resolved_commit'\] = raw\.get\('commit_sha'\) or None/],
  ["§4.2 resolved_url from PEP 610", /record\['resolved_url'\] = direct_url/],
  ["§4.2 wheel_sha256 from PEP 610", /record\['wheel_sha256'\] = raw\['archive_hash'\]/],
  ["§4.3 rule 5 records sorted by name", /sorted\(records, key=lambda item: item\['name'\]\)/],
  ["§4.3 rule 6 warnings on requested_spec", /if spec_is_range\(dep\['requested_spec'\]\):/],
  ["§4.5 pinned_in_package_ts discriminator", /record\['pinned_in_package_ts'\] = False/],
  ["§5 environment block", /'compute_capability': hardware_after\['compute_capability'\]/],
  ["§5 all thirteen environment keys", /'bf16_supported': hardware_after\['bf16_supported'\]/],
  ["§5 fp16 api probed defensively", /getattr\(torch\.cuda, "is_fp16_supported", None\)/],
  ["§5 derivation disclosed in warnings", /was DERIVED from compute capability/],
  ["§5 driver_version from nvidia-smi", /--query-gpu=driver_version/],
  ["§6 two passes", /'pass_index': 2/],
  ["contract comparison literal", /'comparison'\s*:\s*'exact-string-equality-per-name'/],
  ["contract frozen spec comparison", /if a\.get\('spec'\) != b\.get\('spec'\):/],
  ["§6.3 per-name comparison", /def compare_records\(/],
  ["§7 unknowns enumeration", /def collect_unknowns\(/],
  ["§7 unknowns field paths", /'%s\[%s\]\.%s' % \(key, dep\['name'\], field\)|'%s\[%s\]' % \(key, dep\['name'\]\)/],
  ["§8 status derivation", /def derive_status\(/],
  ["§8 FAILED on mismatch", /if assertion == 'MISMATCH' or install_failed:/],
  ["§9 qualification_hash", /sha256_canonical\(dict\(record, qualification_hash=''\)\)/],
  ["§10 self-validation", /def validate_qualification\(/],
  ["§10 name-set equality", /if sorted\(names\) != sorted\(pinned_names\):/],
  ["§10 rule 14 requested_spec", /required audit key is missing or is not a non-empty string/],
  ["§10 rule 15 git frozen shape", /git_frozen = re\.compile\(r'\^git\\\+/],
  ["§10 rule 16 pip frozen shape", /pip_frozen = re\.compile\(r'\^\[A-Za-z0-9\._-\]\+==/],
  ["§10 rule 17 unfrozen fallback", /an unfrozen spec must fall back to the verbatim requested_spec/],
  ["§10 rule 18 additional_dependencies warning", /no warnings\[\] entry /],
  ["§10 blocks on error", /if errors:\n    abort\(/],
  ["§10 secret scan", /secret material found/],
  ["§10 filesystem-path scan", /filesystem path found in the artifact/],
  ["§7.3 freeze gate", /frozen_ok = \(record\['status'\] == 'QUALIFIED'\) and \(len\(record\['unknowns'\]\) == 0\)/],
  ["uv install (not pip)", /'-m', 'pip', 'install', '--upgrade', '-qqq', 'uv'/],
  ["uv pip install with an explicit target", /UV, 'pip', 'install', \*target_flags/],
  ["redaction applied to output", /def redact\(/],
  // §13 Qualification Safety — runtime tripwires + evidence block.
  ["§13 QUALIFICATION_ONLY asserted", /assert QUALIFICATION_ONLY is True/],
  ["§13 tripwire arm function", /def arm_safety_tripwires\(\):/],
  ["§13 optimizer-constructor tripwire", /optimizer_cls\.__init__ = _safety_violation\('optimizer_created'\)/],
  ["§13 optimizer-step tripwire", /patch\(optimizer_cls, step_name, 'optimizer_step_executed'\)/],
  ["§13 tensor backward tripwire", /patch\(tensor_cls, backward_name, 'backward_executed'\)/],
  ["§13 autograd backward tripwire", /patch\(autograd_module, backward_name, 'backward_executed'\)/],
  ["§13 scheduler-constructor tripwire", /scheduler_cls\.__init__ = _safety_violation\('optimizer_created'\)/],
  ["§13 accelerate backward tripwire", /patch\(accelerator_cls, backward_name, 'backward_executed'\)/],
  ["§13 parameter-digest comparison", /PARAM_DIGEST_AFTER != PARAM_DIGEST_BEFORE/],
  ["§13 qualification_safety on the record", /'qualification_safety': qualification_safety/],
  ["§13 basis disclosure per field", /'basis': \{/],
  // §14 Model compatibility — the real gpt-oss-20b qualification.
  ["§14 model_compatibility block on the record", /'model_compatibility': model_compatibility,/],
  ["§14.1 base-model revision from the HF API", /HfApi\(\)\.model_info\(repo_id=repo_id\)/],
  ["§14.1 tokenizer loaded at the resolved revision",
    /AutoTokenizer\.from_pretrained\(BASE_MODEL, revision=BASE_MODEL_REVISION_RESOLVED\)/],
  ["§14.2 Harmony encoder verification", /load_harmony_encoding\(/],
  ["§14.2 Harmony control-token set", /HARMONY_CONTROL_TOKENS = \['<\|start\|>'/],
  ["§14.2 tokenizer chat-template verification", /def verify_harmony_tokenizer\(\):/],
  ["§14.2 real example tokenisation", /def tokenize_example\(\):/],
  ["§14.3 four-bit load path", /load_in_4bit=LOAD_IN_4BIT/],
  ["§14.3 QLoRA adapter init", /FastLanguageModel\.get_peft_model\(/],
  ["§14.3 parameter counts", /def count_parameters\(model\):/],
  ["§14.3 batch collation", /def collate_batch\(\):/],
  ["§14.3 forward-only dry run under no_grad", /with torch\.no_grad\(\):/],
  ["v5 GPT-OSS mask preparation helper", /def prepare_gpt_oss_attention_masks\(\):/],
  ["v5 GPT-OSS official full causal mask", /create_causal_mask/],
  ["v5 GPT-OSS official sliding causal mask", /create_sliding_window_causal_mask/],
  ["v5 GPT-OSS full attention mapping", /'full_attention': full_mask/],
  ["v5 GPT-OSS sliding attention mapping", /'sliding_attention': sliding_mask/],
  ["v5 forward receives prepared mask mapping", /'attention_mask': attention_mask_mapping/],
  ["v5 forward disables cache", /'use_cache': False/],
  ["v5 forward suppresses router auxiliary output", /'output_router_logits': False/],
  ["§14.3 VRAM reading after the adapter init", /VRAM_AFTER_ADAPTER_INIT = vram_allocated_bytes\(\)/],
  ["§14.3 peak VRAM reading", /PEAK_VRAM_DURING_FORWARD = vram_peak_bytes\(\)/],
  ["§14.3 artifact destination probe", /def probe_artifact_destination\(\):/],
  ["§14.4 parameter digest over the trainable parameters", /def parameter_digest\(model\):/],
  ["§14.4 digest before and after the dry run",
    /digest_before = run_model_step\('parameter_digest_before'/],
  ["v5 truthful post-forward digest unknown reason", /parameter_digest_after': 'the post-forward parameter digest did not run because/],
  ["§14.5 measured-failure status", /return 'QUALIFICATION_FAILED_MEASURED'/],
  ["§14.5 failing step is named", /FAILED_STEP = name/],
  ["§14.6 QUALIFIED requires a complete part B", /and model_compatibility_complete\(\)\):/],
  ["§14 model step runner", /def run_model_step\(name, fn\):/],
  ["§14 dataset split-hash verification", /def split_hash\(lines\):/],
  ["§14 dataset hash verification", /def dataset_hash\(split_lines_map\):/],
  ["§14 dataset mismatch aborts the run",
    /Refusing to qualify against a dataset that does not match the committed hashes/],
  ["§14 deterministic example selection",
    /hashed_train = sorted\(\(sha256_line\(line\), index\) for index, line in enumerate\(train_lines\)\)/],
  ["§14 example content is never emitted",
    /example content is never printed, logged or written to the artifact/],
  ["§14 no smaller model is substituted", /No smaller model was substituted/],
  ["§10 rule 13 path scrubber", /def scrub_paths\(value\):/],
  ["§14 status vocabulary includes the measured failure",
    /'QUALIFICATION_FAILED_MEASURED'/],
  ["§14 mission-mandated artifact fields are validated",
    /required_model_fields = \(/],
  ["§14 dependency_versions agrees with dependencies[]",
    /'model_compatibility\.dependency_versions',/],
  ["§14 safety flags agree with qualification_safety",
    /'disagrees with qualification_safety\.%s' % field/],
  // Correction 1: TRAIN-ONLY fixture
  ["§14 TRAIN-ONLY fixture source", /'qualification_fixture_source': 'TRAIN_ONLY'/],
  ["§14 test_data_accessed is False", /'test_data_accessed': False/],
  ["§14 qualification_fixture_hash", /qualification_fixture_hash/],
  ["§14 fixture example selection (2-8)", /fixture_count = min\(8, len\(hashed_train\)\)/],
  ["§14 TRAIN-ONLY abort message", /Only the TRAIN split is required/],
  // Correction 2: generic GPU detection
  ["§5 generic GPU message (no T4 x2)", /GPU \(T4 or better\)/],
  ["§5 multi-GPU detection loop", /for i in range\(torch\.cuda\.device_count\(\)\):/],
  ["§5 gpu_models list", /out\["gpu_models"\] = gpu_models/],
  ["§5 total_visible_vram", /out\["total_visible_vram"\] = sum\(vram_per_gpu\)/],
  ["§14 multi_gpu_used_by_loader", /'multi_gpu_used_by_loader': False/],
  // Correction 3: output hygiene
  ["§14 output hygiene guard", /FORBIDDEN_OUTPUTS = \[/],
  ["§14 output_hygiene_verified", /'output_hygiene_verified':/],
  // Correction 4: no auto-freeze
  ["§14 auto_freeze_applied", /'auto_freeze_applied': False/],
  ["§14 experiment_authorized", /'experiment_authorized': False/],
  ["§14 CTO inspection required", /STOP - CTO inspection required/],
];
for (const [label, re] of contractChecks) {
  if (!re.test(notebookSource)) fail("contract", `missing: ${label}`);
}

// v5 regression: isolate the dry-run body and prove that labels are never
// supplied to the single qualification forward pass.
{
  const match = notebookSource.match(
    /def forward_dry_run\(\):([\s\S]*?)def probe_artifact_destination\(\):/
  );

  if (!match) {
    fail("model-compat", "could not isolate forward_dry_run for the no-labels check");
  } else if (/'labels'\s*:/.test(match[1])) {
    fail(
      "model-compat",
      "forward_dry_run supplies labels; qualification must compute no loss"
    );
  }
}
if (engineVersion && !notebookSource.includes(`ENGINE_VERSION = '${engineVersion}'`)) {
  fail("contract", `ENGINE_VERSION was not injected from package.ts (expected ${engineVersion})`);
}
for (const key of [...REQUIRED_TOP_LEVEL, "qualification_safety", "model_compatibility"]) {
  if (!notebookSource.includes(`'${key}':`)) {
    fail("contract", `required top-level key is not on the assembled record: ${key}`);
  }
}

// ---------------------------------------------------------------------------
// 4a. Install observability + recipe alignment regression checks
//     (prevents dependency-install failures from being reported without their
//     real redacted resolver reason; enforces the upstream-aligned recipe)
// ---------------------------------------------------------------------------

const installChecks = [
  // Observability: run_install_command captures full stdout+stderr
  ["install observability wrapper", /def run_install_command\(cmd, timeout=None, phase='install'\):/],
  ["full stdout capture on failure", /stdout_red = scrub_paths\(redact\(proc\.stdout or ''\)\)/],
  ["full stderr capture on failure", /stderr_red = scrub_paths\(redact\(proc\.stderr or ''\)\)/],
  ["diagnostic artifact persisted", /write_canonical\(INSTALL_DIAGNOSTIC_PATH, diagnostic\)/],
  ["exception includes resolver reason", /stdout_trim,.*stderr_trim/s],
  // Dry-run probe before mutating the environment
  ["dry-run probe present", /--dry-run/],
  ["dry-run uses exact stage command", /run_install_command\(\[\*cmd, '--dry-run'\], timeout=timeout, phase=phase \+ '-dry-run'\)/],
  // No -qqq on the governed install stages; resolver diagnostics must remain visible
  ["install uses same stage command", /run_install_command\(cmd, timeout=timeout, phase=phase\)/],
  // Preinstalled torch/triton preservation
  ["preservation uses a fresh interpreter", /probe_modules\(sys\.executable, dep\['modules'\]\)/],
  ["preserve_if_preinstalled flag checked", /dep\.get\('preserve_if_preinstalled'\)/],
  ["torch preserve flag in inventory", /"preserve_if_preinstalled": true/],
  // Force-upgrade step (matches upstream Unsloth Kaggle recipe)
  ["force-upgrade no-deps step", /'--upgrade', '--no-deps',\s*\*FORCE_UPGRADE_SPECS/],
  // torchao force-upgrade
  ["torchao no-deps upgrade", /'--no-deps', '--upgrade',\s*'torchao>=0\.16\.0'/],
  // torchao in additional_dependencies
  ["torchao in import smoke modules", /"torchao"/],
  ["transitive preservation constraints", /'--constraint', str\(PRESERVE_CONSTRAINTS_PATH\)/],
  ["preserved versions rechecked", /abort\('Preserved dependency changed: %s' % name\)/],
  ["Kaggle kernel exclusion", /KAGGLE_PRESERVE_PREINSTALLED and d\.get\('skip_if_kaggle_preserved'\)/],
  ["skips recorded", /'skipped_dependencies':/],
  ["export retains general inventory", /for requested in INVENTORY\['pinned_dependencies'\]:/],
  ["export retains runtime-only requests", /requested\['name'\] in PRESERVED or requested\['name'\] in skipped_names/],
  ["fresh passes use shared install plan", /fresh_plan = build_install_plan\([\s\S]*?fresh=True,[\s\S]*?\)/],
  // v4 regression: huggingface-hub in resolver-managed stage
  ["huggingface-hub in import smoke modules", /"huggingface_hub"/],
  ["huggingface-hub resolver-managed spec", /huggingface-hub>=0\.34\.0,<1\.0/],
  // v4 regression: build_install_plan always excludes PRESERVED (not just fresh=False)
  ["build_install_plan always excludes preserved", /and d\['name'\] not in PRESERVED\]/],
  ["constraint flags skipped in fresh pass", /constraint_flags = \[\] if fresh else CONSTRAINT_FLAGS/],
  ["fresh pass disables transitive runtime deps", /fresh_no_deps_flags = \(/],
  ["fresh pass requires binary wheels", /fresh_binary_flags = \(/],
  ["fresh pass requires exactly one no-deps", /cmd\.count\('--no-deps'\) != 1/],
  ["fresh pass rejects missing or duplicate no-deps", /if cmd\.count\('--no-deps'\) != 1:[\s\S]*?raise RuntimeError\(/],
  ["fresh pass requires exactly one binary guard", /cmd\.count\('--only-binary'\) != 1/],
  ["fresh pass rejects source builds", /fresh pass %d stage permits source-build dependencies/],
  ["fresh pass rejects direct preserved requests", /if direct_preserved:[\s\S]*?raise RuntimeError\(/],
  ["fresh resolution excludes preserved", /fresh_repro_specs = \[[\s\S]*?if dep\['name'\] not in PRESERVED/],
  ["fresh pinned records exclude preserved", /fresh_pinned_specs = \[[\s\S]*?if dep\['name'\] not in PRESERVED/],
  ["v6 fresh reproducibility helper exists", /def run_fresh_repro_pass\(pass_index\):/],
  // v4 regression: preserved environment facts in reproducibility context
  ["preserved_environment_facts in reproducibility", /'preserved_environment_facts'/],
  ["preserved facts marked environment-preserved", /'source': 'environment-preserved'/],
  // v4 regression: pass 2 comparison excludes preserved deps
  ["v6 fresh pass 1 executes", /fresh_pass_1 = run_fresh_repro_pass\(\s*1\s*\)/],
  ["v6 fresh pass 2 executes", /fresh_pass_2 = run_fresh_repro_pass\(\s*2\s*\)/],
  // v4 regression: cross-list name uniqueness check
  // v6 regression: contract ?6 is TWO independent fresh environments
  ["v6 uses distinct fresh venv names", /gharibo-qualify-repro-pass-%d/],
  ["v6 verifies fresh python identity", /base_python != hardware_after\['python_version'\]/],
  ["v6 compares fresh pinned pass 1 vs pass 2", /compare_records\(\s*fresh_pass_1\['pinned'\],\s*fresh_pass_2\['pinned'\]/],
  ["v6 compares fresh additional pass 1 vs pass 2", /compare_records\(\s*fresh_pass_1\['additional'\],\s*fresh_pass_2\['additional'\]/],
  ["v6 active runtime exact specs derive from fresh pass 1", /exact_runtime_records = \(\s*fresh_pass_1\['pinned'\][\s\S]*?fresh_pass_1\['additional'\]/],
  ["v6 active runtime alignment stage", /'active-runtime-align'/],
  ["v6 active runtime alignment uses no-deps", /alignment_cmd = \[[\s\S]*?'--no-deps'/],
  ["v6 active runtime alignment uses binary wheels", /alignment_cmd = \[[\s\S]*?'--only-binary'[\s\S]*?':all:'/],
  ["v6 preserved runtime rechecked after alignment", /measured_version[\s\S]*?!=[\s\S]*?expected_version[\s\S]*?raise RuntimeError\(/],
  ["v6 import smoke reruns after alignment", /if failed_imports:[\s\S]*?raise RuntimeError\(/],
  ["v6 active runtime alignment is recorded", /'active_runtime_alignment'/],
  ["v6 active runtime is compared against fresh pass 1", /compare_records\(\s*active_non_preserved,\s*fresh_pass_1\['pinned'\]/],
  ["cross-list uniqueness validation", /cross-list name uniqueness violation/],
  // v4 regression: harmony not duplicated when already pinned
  ["harmony already pinned guard", /_harmony_already_pinned/],
  ["harmony not duplicated into additional", /not duplicated into additional_dependencies/],
];
for (const [label, re] of installChecks) {
  if (!re.test(notebookSource)) fail("install", `missing: ${label}`);
}

for (const stale of [
  "PASS_1_STARTED_AT",
  "PASS_1_FINISHED_AT",
  "PASS_1_REPRO_DEPENDENCIES",
  "PASS_1_DEPENDENCY_SET_HASH",
]) {
  if (notebookSource.includes(stale)) {
    fail(
      "install",
      `v6 must not label the active Kaggle runtime as reproducibility pass 1: ${stale}`,
    );
  }
}

const expectedRecipe = new Map([
  ['unsloth', 'unsloth'], ['unsloth_zoo', 'unsloth_zoo'],
  ['transformers', 'transformers==4.56.2'], ['trl', 'trl==0.22.2'],
  ['tokenizers', 'tokenizers>=0.22.0,<=0.23.0'], ['torchao', 'torchao>=0.16.0'],
  ['huggingface-hub', 'huggingface-hub>=0.34.0,<1.0'],
]);
const recipeByName = new Map([...inventory.pinned_dependencies, ...inventory.additional_dependencies]
  .map(dep => [dep.name, dep]));
for (const [name, spec] of expectedRecipe) {
  const entry = recipeByName.get(name);
  if (!entry || entry.source !== 'pip' || entry.requested_spec !== spec || entry.install !== spec || entry.url !== null) {
    fail('install', name + ': recipe source/spec/install metadata drift');
  }
}
if (tritonKernels?.skip_if_kaggle_preserved !== true) fail('install', 'triton_kernels must be conditional');
for (const name of ['torch', 'triton']) {
  if (pinnedByName.get(name)?.preserve_if_preinstalled !== true) fail('install', name + ': preservation required');
}
if (/WARNING \(preserved\)/.test(notebookSource)) fail('install', 'preserved version mismatches must fail equality');

// Regression: the main install command must NOT use -qqq (it hides resolver errors).
// The bootstrap may use -qqq; governed install stages must not suppress resolver diagnostics.
const qqqInstallRe = /run_install_command\([^)]*-qqq[^)]*\)/s;
if (qqqInstallRe.test(notebookSource)) {
  fail("install", "run_install_command must not use -qqq (it hides the resolver reason)");
}

// ---------------------------------------------------------------------------
// 4b. Model compatibility (contract §14) — the real gpt-oss-20b sequence
// ---------------------------------------------------------------------------

if (identity) {
  if (!notebookSource.includes("BASE_MODEL = MODEL_COMPAT['base_model']")) {
    fail("model-compat", "the base model id is not wired into the notebook");
  }
  if (!notebookSource.includes("BASE_MODEL_REVISION_PIN = MODEL_COMPAT['expected_base_model_revision']")) {
    fail("model-compat", "the pinned base-model revision is not wired into the notebook");
  }
  if (!notebookSource.includes("LOADER_MODEL = MODEL_COMPAT['loader_model']")) {
    fail("model-compat", "the loader model id is not wired into the notebook");
  }
}
if (!notebookSource.includes("EXPECTED_DATASET_HASH = DATASET['dataset_hash']")) {
  fail("model-compat", "the expected dataset hash is not wired into the notebook");
}
if (!notebookSource.includes("EXPECTED_SPLIT_HASHES = DATASET['split_hashes']")) {
  fail("model-compat", "the expected split hashes are not wired into the notebook");
}
for (const status of STATUS_VOCABULARY) {
  if (!notebookSource.includes(status)) fail("model-compat", `status vocabulary entry is missing: ${status}`);
}
for (const key of REQUIRED_MODEL_KEYS) {
  if (!notebookSource.includes(`'${key}':`)) {
    fail("model-compat", `mission-mandated model_compatibility key is not on the record: ${key}`);
  }
}

/** Every mission step must be a named, individually-recorded step. */
const MISSION_STEPS = [
  "resolve_base_model_revision",
  "resolve_loader_model_revision",
  "load_tokenizer",
  "verify_harmony_encoding",
  "verify_harmony_tokenizer",
  "tokenize_real_example",
  "load_base_model",
  "init_qlora_adapters",
  "count_parameters",
  "collate_batch",
  "parameter_digest_before",
  "forward_dry_run",
  "parameter_digest_after",
  "verify_artifact_destination",
];
for (const step of MISSION_STEPS) {
  if (!notebookSource.includes(`'${step}'`)) {
    fail("model-compat", `mission step is not recorded as a step: ${step}`);
  }
}

/** The harness must refuse to run without the real, hash-verified dataset. */
for (const needle of ["def locate_dataset_dir():", "the GHARIBO dataset was not found under ",
  "the attached dataset is not "]) {
  if (!notebookSource.includes(needle)) fail("model-compat", `missing the dataset gate: ${needle}`);
}

/** No dataset example content may be embedded in the committed notebook. */
if (fs.existsSync(DATASET_DIR)) {
  let embedded = 0;
  for (const split of ["train", "validation", "test"]) {
    const file = path.join(DATASET_DIR, `${split}.jsonl`);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (trimmed.length < 200) continue;
      if (notebookSource.includes(trimmed)) {
        embedded++;
        if (embedded <= 3) {
          fail("model-compat", `dataset example content is embedded in the notebook (${split} split)`);
        }
      }
    }
  }
  if (embedded === 0) notes.push("no dataset example content is embedded in the notebook");
} else {
  notes.push("dataset not present locally — the embedded-content scan was skipped");
}

// ---------------------------------------------------------------------------
// 5. T4 / Turing (sm_75) constraints
// ---------------------------------------------------------------------------

const t4Checks = [
  ["MIN_COMPUTE_CAPABILITY = (7, 5)", /MIN_COMPUTE_CAPABILITY = \(7, 5\)/],
  ["sm_75 floor enforced", /tuple\(capability\) < MIN_COMPUTE_CAPABILITY/],
  ["fp16 selected below sm_80", /def recipe_dtype\([\s\S]{0,200}?return 'fp16'/],
  ["bf16 rejected on the T4 path", /recipe_dtype_after != 'fp16'/],
  ["Turing build target", /TORCH_CUDA_ARCH_LIST'\] = '7\.5'/],
  ["FlashAttention-2 capability probe", /flash_attention_2_supported = bool\(capability is not None and capability\[0\] >= 8\)/],
  ["VRAM gate present", /MIN_VRAM_BYTES = 14 \* 1024 \*\* 3/],
  ["fails loudly before installing", /abort\('%s hardware gate failed/],
];
for (const [label, re] of t4Checks) {
  if (!re.test(notebookSource)) fail("t4", `missing T4 constraint: ${label}`);
}

// ---------------------------------------------------------------------------
// 6. Qualification only — no weights, no training
// ---------------------------------------------------------------------------

for (const token of FORBIDDEN_TOKENS) {
  if (notebookSource.includes(token)) {
    fail("qualification-only", `forbidden token "${token}" appears — the harness must not train or download weights`);
  }
}

// ---------------------------------------------------------------------------
// 7. Secret hygiene
// ---------------------------------------------------------------------------

for (const { label, re } of SECRET_SHAPES) {
  const hit = notebookSource.match(re);
  if (hit) fail("secrets", `secret-shaped literal (${label}) found in the harness: "${hit[0]}"`);
}

// ---------------------------------------------------------------------------
// 8. Cell-order smoke check — every user-defined function called in any cell
//    must be defined in an earlier cell (or earlier in the same cell, before
//    the call).  This prevents the class of generated-notebook ordering defect
//    where a helper is used before its definition (the "probe_environment"
//    NameError on Kaggle).  The check is a static, line-by-line walk: it does
//    not execute the notebook, so it catches the defect at commit time.
// ---------------------------------------------------------------------------

/**
 * Extracts bare function-call targets from a line of Python source.
 * Returns the set of names that appear as NAME( and are NOT:
 *   - a def line (def NAME(),
 *   - a method call (obj.NAME(),
 *   - a comment-only line (# ... NAME(),
 *   - a decorator (@NAME( — treated as a definition, not a call).
 *
 * String-literal false positives are tolerated: they are rare in this
 * notebook (the raw probe strings use only stdlib calls) and a false
 * positive merely flags a name for human review, never silently passes.
 */
function extractCallTargets(line) {
  const targets = [];
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) return targets; // comment-only line
  if (trimmed.startsWith("@")) return targets; // decorator
  // Match NAME( but exclude def NAME( and .NAME(
  const re = /\b([A-Za-z_]\w*)\s*\(/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const name = m[1];
    const before = line.slice(0, m.index);
    // Skip def NAME(
    if (/\bdef\s+$/.test(before)) continue;
    // Skip .NAME(
    if (before.endsWith(".")) continue;
    // Skip keyword NAME( (if, for, while, assert, return, print is builtin...)
    // — we only flag user-defined names, so keywords are filtered later.
    targets.push({ name, line, index: m.index });
  }
  return targets;
}

// Step 1: collect every user-defined function name across ALL cells.
const allUserDefs = new Set();
const defRe = /^\s*def\s+(\w+)\s*\(/;
for (const src of cellSources) {
  for (const line of src.split("\n")) {
    const m = line.match(defRe);
    if (m) allUserDefs.add(m[1]);
  }
}

// Step 2: walk cells in order, tracking which functions are defined so far.
// We only check calls at the MODULE level (NOT inside a function body),
// because Python function bodies are not executed at definition time — only at
// call time.  A stack of indentation levels tracks nested function definitions.
const definedSoFar = new Set();
for (let ci = 0; ci < cellSources.length; ci++) {
  const lines = cellSources[ci].split("\n");
  const defStack = []; // indentation levels of enclosing def bodies
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const trimmed = line.trim();
    // Blank lines and comment-only lines don't affect the def-body stack.
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const indent = line.match(/^(\s*)/)[1].length;

    // Pop function bodies we've exited (indentation returned to or below the def).
    while (defStack.length > 0 && indent <= defStack[defStack.length - 1]) {
      defStack.pop();
    }

    // Check if this is a new function definition.
    const defMatch = line.match(defRe);
    if (defMatch) {
      definedSoFar.add(defMatch[1]);
      defStack.push(indent);
      continue; // Don't check calls on the def line itself.
    }

    // Only check calls at the module level (not inside any function body).
    if (defStack.length === 0) {
      for (const { name } of extractCallTargets(line)) {
        if (allUserDefs.has(name) && !definedSoFar.has(name)) {
          fail("cell-order",
            `function '${name}' is called in cell ${ci} (line ${li + 1}) before it is defined — ` +
            `move the def into an earlier cell or above the call within the same cell.`);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const line = "-".repeat(72);
console.log(line);
console.log("GHARIBO AI LAB - qualification harness check");
console.log(line);
console.log(`  notebook        : ${path.relative(ROOT, NOTEBOOK_PATH).split(path.sep).join("/")}`);
console.log(`  contract        : docs/ENV_QUALIFICATION_CONTRACT.md v${CONTRACT_DOC_VERSION} (artifact schema ${CONTRACT_SCHEMA_VERSION})`);
console.log(`  cells           : ${cellSources.length}`);
console.log(`  dependencies[]  : ${inventory.pinned_dependencies.map((d) => d.name).join(", ")}`);
console.log(`  additional[]    : ${inventory.additional_dependencies.map((d) => d.name).join(", ")} (harmony is pinned, not duplicated)`);
console.log(`  engine_version  : ${engineVersion ?? "(unparsed)"}`);
console.log(`  base model      : ${modelCompatibility.base_model ?? "(missing)"} @ ${modelCompatibility.expected_base_model_revision ?? "(missing)"}`);
console.log(`  loader model    : ${modelCompatibility.loader_model ?? "(missing)"} (${modelCompatibility.loader_quantization ?? "?"})`);
console.log(`  dataset         : ${datasetInventory.id ?? "(missing)"} ${datasetInventory.version ?? ""} (${datasetInventory.example_count ?? "?"} examples)`);
console.log(`  model-compat    : ${MISSION_STEPS.length} named steps, ${REQUIRED_MODEL_KEYS.length} mandated artifact keys`);
console.log(`  cell-order      : ${allUserDefs.size} user-defined functions, ${cellSources.length} cells checked`);
console.log(`  install         : ${installChecks.length} observability + recipe checks`);
for (const note of notes) console.log(`  ${note}`);
console.log(line);

if (failures.length === 0) {
  console.log("RESULT: OK - harness matches package.ts and conforms to the qualification contract.");
  process.exit(0);
}

console.log(`RESULT: FAILED - ${failures.length} problem(s):`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
