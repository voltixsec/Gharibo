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
 *      `UNSLOTH_ENGINE_VERSION` in apps/web/lib/training/package.ts (no drift);
 *   3. the inventory pre-fills NO version and NO SHA (never fabricate);
 *   4. the emitted artifact conforms to docs/ENV_QUALIFICATION_CONTRACT.md v1.0.0
 *      (§3 top level, §4 records, §5 environment, §6 reproducibility, §7 unknowns,
 *      §8 status, §9 content address, §10 self-validation);
 *   5. the T4/Turing constraints are encoded (sm_75 floor, fp16, no bf16, no FA2,
 *      TORCH_CUDA_ARCH_LIST=7.5);
 *   6. the harness stays qualification-only (no model download, no training);
 *   7. no secret-shaped literal and no secret-reading code path is present.
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
  readPinnedEngineDependencies,
} from "./qualify-kaggle-env.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const p = (...parts) => path.join(ROOT, ...parts);

const NOTEBOOK_PATH = p("scripts", "qualify", "qualify-kaggle-env.ipynb");
const PACKAGE_TS = p("apps", "web", "lib", "training", "package.ts");
const CONTRACT_DOC = p("docs", "ENV_QUALIFICATION_CONTRACT.md");

/** Contract version this harness targets. */
const CONTRACT_SCHEMA_VERSION = "1.0.0";

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
const REQUIRED_ADDITIONAL = [];
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

/** Strings that must NOT appear: they would mean the harness does more than qualify. */
const FORBIDDEN_TOKENS = [
  "from_pretrained",
  "FastLanguageModel",
  "SFTTrainer",
  "SFTConfig",
  "AutoTokenizer",
  "AutoModelForCausalLM",
  "push_to_hub",
  "kaggle_secrets",
  "UserSecretsClient",
  "HF_TOKEN",
  "hf_token",
  "trainer.train",
  ".train(",
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
// 4. Contract conformance (docs/ENV_QUALIFICATION_CONTRACT.md v1.0.0)
// ---------------------------------------------------------------------------

if (!fs.existsSync(CONTRACT_DOC)) {
  fail("contract", `missing ${path.relative(ROOT, CONTRACT_DOC)} — the harness targets that contract`);
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
  ["§6 comparison literal", /'comparison': 'exact-string-equality-per-name'/],
  ["§6.3 compares the frozen spec", /frozen spec %s != pass-2 %s/],
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
  ["uv pip install with an explicit target", /UV, 'pip', 'install', \*TARGET_FLAGS/],
  ["redaction applied to output", /def redact\(/],
];
for (const [label, re] of contractChecks) {
  if (!re.test(notebookSource)) fail("contract", `missing: ${label}`);
}
if (engineVersion && !notebookSource.includes(`ENGINE_VERSION = '${engineVersion}'`)) {
  fail("contract", `ENGINE_VERSION was not injected from package.ts (expected ${engineVersion})`);
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
// Report
// ---------------------------------------------------------------------------

const line = "-".repeat(72);
console.log(line);
console.log("GHARIBO AI LAB - qualification harness check");
console.log(line);
console.log(`  notebook        : ${path.relative(ROOT, NOTEBOOK_PATH).split(path.sep).join("/")}`);
console.log(`  contract        : docs/ENV_QUALIFICATION_CONTRACT.md v${CONTRACT_SCHEMA_VERSION}`);
console.log(`  cells           : ${cellSources.length}`);
console.log(`  dependencies[]  : ${inventory.pinned_dependencies.map((d) => d.name).join(", ")}`);
console.log(`  additional[]    : ${inventory.additional_dependencies.map((d) => d.name).join(", ")} + harmony`);
console.log(`  engine_version  : ${engineVersion ?? "(unparsed)"}`);
for (const note of notes) console.log(`  ${note}`);
console.log(line);

if (failures.length === 0) {
  console.log("RESULT: OK - harness matches package.ts and conforms to the qualification contract.");
  process.exit(0);
}

console.log(`RESULT: FAILED - ${failures.length} problem(s):`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(1);
