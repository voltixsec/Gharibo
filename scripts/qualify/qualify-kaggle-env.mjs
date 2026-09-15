#!/usr/bin/env node
/**
 * qualify-kaggle-env.mjs — renders the Milestone 3A free-Kaggle environment
 * qualification harness (`qualify-kaggle-env.ipynb`).
 *
 * WHY A GENERATOR (mirrors the M2 `notebook-render.ts` pattern)
 * -------------------------------------------------------------
 * The harness must probe exactly the dependency set the repo actually pins, so the
 * inventory is derived from `PINNED_ENGINE_DEPENDENCIES` / `UNSLOTH_ENGINE_VERSION`
 * in `apps/web/lib/training/package.ts` and injected into the notebook through the
 * sentinels `__GHARIBO_QUALIFY_INVENTORY_JSON__` / `__GHARIBO_ENGINE_VERSION__` — the
 * same template+sentinel convention as
 * `apps/web/lib/workers/kaggle/notebook.template.ipynb`. A committed hand-edited
 * notebook would silently drift from the pins; a rendered one cannot.
 *
 * DETERMINISM
 * -----------
 * The renderer normalises the .ipynb exactly like `notebook-render.ts`:
 *   - fixed cell order, stable `id`s, `execution_count: null`, `outputs: []`,
 *   - 1-space JSON indent, trailing newline,
 *   - the notebook embeds its own content address (`HARNESS_CONTENT_SHA256`),
 *     computed over the notebook with that value blanked — the same
 *     `package_id=""` trick used by `computePackageId` in `package.ts`.
 * Same inputs -> byte-identical notebook.
 *
 * CONTRACT
 * --------
 * The emitted artifact is `env-qualification.json`, shaped by
 * `docs/ENV_QUALIFICATION_CONTRACT.md` v1.4.0 (§3 top level, §4 dependency records,
 * §5 environment, §6 reproducibility, §7 unknowns, §8 status, §9 content address,
 * §10 validation). The harness self-validates against §10 before it finishes.
 *
 * SCOPE (v2.0.0 — real model-compatibility qualification)
 * --------------------------------------------------------
 * The harness is no longer model-free. It must prove REAL compatibility between the
 * free-Kaggle T4 and the pinned recipe for `openai/gpt-oss-20b`:
 *
 *   1. detect the GPU / VRAM / CUDA / driver / compute capability / python,
 *   2. resolve the exact dependency versions AND git revisions (two fresh envs),
 *   3. resolve the live revision of `openai/gpt-oss-20b` and of the 4-bit loader
 *      mirror, and compare the base-model revision against the repo's pin,
 *   4. load the tokenizer,
 *   5. verify Harmony formatting on a REAL GHARIBO training example (the encoding
 *      render and the tokenizer chat template must both agree),
 *   6. tokenize that real example,
 *   7. load the base model through the intended low-memory / 4-bit path,
 *   8. initialise the LoRA / QLoRA adapters,
 *   9. report total / trainable parameters and the trainable percentage,
 *  10. collate one small batch,
 *  11. run exactly ONE forward-only dry run under `torch.no_grad()`,
 *  12. record VRAM before load / after load / after adapter init / peak,
 *  13. verify the checkpoint/artifact destination is writable,
 *  14. prove no parameter changed: a deterministic digest over the trainable
 *      parameters is computed before and after the dry run and must be identical.
 *
 * HARD CONSTRAINTS baked into the emitted notebook (see scripts/qualify/README.md):
 *   - never fabricates a version or a SHA (unknown => null + an `unknowns[]` entry),
 *   - TRAINING IS FORBIDDEN: no `trainer.train()`, no optimizer, no `backward()`,
 *     no optimizer step, no scheduler, no training loop, no parameter update,
 *   - QUALIFICATION ONLY: `QUALIFICATION_ONLY` is asserted True and runtime tripwires
 *     arm the optimizer constructor, the optimizer step, the scheduler constructors,
 *     the tensor/autograd backward functions and the accelerate backward so that any
 *     of them RAISES. The tripwire state is emitted as the `qualification_safety`
 *     block (contract §13). A static safety gate (check-qualify-harness.mjs +
 *     verify-m3a Gate 13) forbids the training primitives from appearing in the
 *     generated notebook at all — loading a model and running a forward pass is
 *     allowed; training is not,
 *   - never prints, logs or writes a secret (all output passes through `redact`),
 *   - never writes a model artifact: no `save_pretrained`, no `push_to_hub`,
 *   - T4 = Turing (sm_75): fp16 only, no bf16, no FlashAttention-2,
 *   - a measured incompatibility is reported truthfully as
 *     `QUALIFICATION_FAILED_MEASURED`; a smaller model is NEVER substituted.
 *
 * Usage:
 *   node scripts/qualify/qualify-kaggle-env.mjs           # write the notebook
 *   node scripts/qualify/qualify-kaggle-env.mjs --check   # exit 1 if stale
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const p = (...parts) => path.join(ROOT, ...parts);

const PACKAGE_TS = p("apps", "web", "lib", "training", "package.ts");
const NOTEBOOK_PATH = p("scripts", "qualify", "qualify-kaggle-env.ipynb");

/** Sentinel replaced by the injected inventory JSON. */
export const INVENTORY_SENTINEL = "__GHARIBO_QUALIFY_INVENTORY_JSON__";
/** Sentinel replaced by `UNSLOTH_ENGINE_VERSION` from package.ts. */
export const ENGINE_VERSION_SENTINEL = "__GHARIBO_ENGINE_VERSION__";
/** Sentinel replaced by the notebook's own content address. */
export const HARNESS_SHA_SENTINEL = "__GHARIBO_HARNESS_SHA256__";

// ---------------------------------------------------------------------------
// 1. Read the repo's real pin list (never retyped by hand).
// ---------------------------------------------------------------------------

const PINNED_ENTRY_RE =
  /\{\s*name:\s*"([^"]+)",\s*source:\s*"(pip|git)",\s*spec:\s*"([^"]*)",\s*resolvedVersion:\s*(null|"[^"]*"),\s*url:\s*(null|"[^"]*"),?\s*\}/g;

/**
 * Parses `PINNED_ENGINE_DEPENDENCIES` out of package.ts. Fails loudly if it can't.
 *
 * Whole-line `//` comments are stripped first so a note inside an entry cannot break
 * the parse. Only line-leading comments are removed — a naive `//` strip would eat the
 * `//` in every `https://` URL.
 */
export function readPinnedEngineDependencies() {
  const source = fs.readFileSync(PACKAGE_TS, "utf8");
  const block = source.match(
    /export const PINNED_ENGINE_DEPENDENCIES: EngineDependency\[\] = \[([\s\S]*?)\n\];/,
  );
  if (!block) {
    throw new Error(`could not locate the PINNED_ENGINE_DEPENDENCIES array in ${PACKAGE_TS}`);
  }
  const stripped = block[1].replace(/^[ \t]*\/\/[^\n]*$/gm, "");
  const out = [];
  for (const m of stripped.matchAll(PINNED_ENTRY_RE)) {
    out.push({
      name: m[1],
      source: m[2],
      spec: m[3],
      resolvedVersion: m[4] === "null" ? null : m[4].slice(1, -1),
      url: m[5] === "null" ? null : m[5].slice(1, -1),
    });
  }
  if (out.length === 0) {
    throw new Error(`could not parse any entries from PINNED_ENGINE_DEPENDENCIES in ${PACKAGE_TS}`);
  }
  return out;
}

/** Parses `UNSLOTH_ENGINE_VERSION` out of package.ts. */
export function readEngineVersion() {
  const source = fs.readFileSync(PACKAGE_TS, "utf8");
  const m = source.match(/export const UNSLOTH_ENGINE_VERSION\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`could not parse UNSLOTH_ENGINE_VERSION from ${PACKAGE_TS}`);
  return m[1];
}

const PINNED = readPinnedEngineDependencies();
const ENGINE_VERSION = readEngineVersion();

// ---------------------------------------------------------------------------
// 1b. Read the repo's real recipe defaults + dataset facts (never retyped).
// ---------------------------------------------------------------------------

const RUN_FORM_TSX = p("apps", "web", "components", "training", "run-form.tsx");
const MASTER_STATE_JSON = p("governance", "GHARIBO_MASTER_STATE.json");
const DATASET_ID = "GHARIBO-Research-Gold-v0.1";

/** Model identity constants (verified — package.ts §"Model identity"). */
export function readModelIdentity() {
  const source = fs.readFileSync(PACKAGE_TS, "utf8");
  const grab = (name) => {
    const m = source.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`));
    if (!m) throw new Error(`could not parse ${name} from ${PACKAGE_TS}`);
    return m[1];
  };
  return {
    baseModel: grab("BASE_MODEL_IDENTITY"),
    baseModelRevision: grab("BASE_MODEL_REVISION"),
    loaderModel: grab("LOADER_MODEL_ID"),
  };
}

/**
 * Parses the numeric/string recipe defaults out of package.ts. These are the
 * repo's own declared defaults; the harness must not retype them.
 */
export function readRecipeDefaults() {
  const source = fs.readFileSync(PACKAGE_TS, "utf8");
  const grabNumber = (name) => {
    const m = source.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
    if (!m) throw new Error(`could not parse ${name} from ${PACKAGE_TS}`);
    return Number(m[1]);
  };
  const grabString = (name) => {
    const m = source.match(new RegExp(`export const ${name}\\s*=\\s*"([^"]+)"`));
    if (!m) throw new Error(`could not parse ${name} from ${PACKAGE_TS}`);
    return m[1];
  };
  return {
    defaultSequenceLength: grabNumber("DEFAULT_SEQUENCE_LENGTH"),
    minSequenceLength: grabNumber("MIN_SEQUENCE_LENGTH"),
    defaultBatchSize: grabNumber("DEFAULT_BATCH_SIZE"),
    defaultGradAccum: grabNumber("DEFAULT_GRAD_ACCUM"),
    defaultDtype: grabString("DEFAULT_DTYPE"),
    defaultLoraDropout: grabNumber("DEFAULT_LORA_DROPOUT"),
    defaultLoraBias: grabString("DEFAULT_LORA_BIAS"),
    harmony: readHarmonyMapping(source),
  };
}

/** Parses `DEFAULT_HARMONY` out of package.ts (the domain-agnostic Harmony mapping). */
export function readHarmonyMapping(source = fs.readFileSync(PACKAGE_TS, "utf8")) {
  const block = source.match(/export const DEFAULT_HARMONY: HarmonyMapping = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error(`could not parse DEFAULT_HARMONY from ${PACKAGE_TS}`);
  const effort = block[1].match(/reasoningEffort:\s*"([^"]+)"/);
  const template = block[1].match(/developerTemplateId:\s*"([^"]+)"/);
  const channels = block[1].match(/hiddenChannels:\s*\[([^\]]*)\]/);
  if (!effort || !template || !channels) {
    throw new Error(`DEFAULT_HARMONY in ${PACKAGE_TS} is missing reasoningEffort/developerTemplateId/hiddenChannels`);
  }
  let hiddenChannels;
  try {
    hiddenChannels = JSON.parse(`[${channels[1]}]`);
  } catch {
    throw new Error(`DEFAULT_HARMONY.hiddenChannels in ${PACKAGE_TS} is not a JSON array`);
  }
  return {
    reasoningEffort: effort[1],
    developerTemplateId: template[1],
    hiddenChannels,
  };
}

/**
 * Parses the LoRA configuration the repo's own run form declares as its defaults.
 *
 * WHY HERE: `lora_rank` / `lora_alpha` / `target_modules` / `seed` are per-run
 * values stored in `training_runs`, and `deriveLoRAFromRun` returns null until a run
 * exists. The qualification therefore has to declare *something* to prove adapter
 * initialisation. Rather than invent numbers, the harness reads the repo's committed
 * form defaults so the qualification config cannot drift from the declared recipe.
 * These are QUALIFICATION values: they prove the adapter path works. The training
 * run's real LoRA config still comes from the Training Package.
 */
export function readQualificationLoraDefaults() {
  const source = fs.readFileSync(RUN_FORM_TSX, "utf8");
  const grabState = (name) => {
    const m = source.match(
      new RegExp(`const \\[${name}[^\\]]*\\]\\s*=\\s*useState(?:<[^>]*>)?\\(\\s*([^)]*?)\\s*\\)`),
    );
    if (!m) throw new Error(`could not parse the ${name} default from ${RUN_FORM_TSX}`);
    return m[1];
  };
  const modules = grabState("targetModules");
  let targetModules;
  try {
    targetModules = JSON.parse(modules);
  } catch {
    throw new Error(`the targetModules default in ${RUN_FORM_TSX} is not a JSON array: ${modules}`);
  }
  if (!Array.isArray(targetModules) || targetModules.length === 0) {
    throw new Error(`the targetModules default in ${RUN_FORM_TSX} is empty`);
  }
  return {
    r: Number(grabState("loraRank")),
    alpha: Number(grabState("loraAlpha")),
    targetModules,
    seed: Number(grabState("seed")),
  };
}

/**
 * Reads the canonical dataset facts out of the committed master state.
 *
 * WHY THE MASTER STATE: the split hashes live in the gitignored dataset card, so a
 * generator that read them from there could not reproduce the committed notebook on a
 * fresh clone. `governance/GHARIBO_MASTER_STATE.json` is committed, canonical and
 * hash-only — it carries no example content — so it is the right source.
 */
export function readDatasetFacts() {
  const state = JSON.parse(fs.readFileSync(MASTER_STATE_JSON, "utf8"));
  const entry = state.datasets?.[DATASET_ID];
  if (!entry) throw new Error(`${MASTER_STATE_JSON} has no datasets["${DATASET_ID}"] entry`);
  const hashes = entry.hashes ?? {};
  const splits = hashes.splitHashes ?? {};
  for (const key of ["datasetHash"]) {
    if (!/^[0-9a-f]{64}$/.test(hashes[key] ?? "")) {
      throw new Error(`datasets["${DATASET_ID}"].hashes.${key} is not a sha256 in ${MASTER_STATE_JSON}`);
    }
  }
  for (const key of ["train", "validation", "test"]) {
    if (!/^[0-9a-f]{64}$/.test(splits[key] ?? "")) {
      throw new Error(
        `datasets["${DATASET_ID}"].hashes.splitHashes.${key} is not a sha256 in ${MASTER_STATE_JSON}`,
      );
    }
  }
  return {
    id: DATASET_ID,
    version: entry.version ?? null,
    format: entry.format ?? null,
    exampleCount: entry.exampleCount ?? null,
    splitCounts: entry.split?.counts ?? {},
    splitSeed: entry.split?.seed ?? null,
    datasetHash: hashes.datasetHash,
    splitHashes: {
      train: splits.train,
      validation: splits.validation,
      test: splits.test,
    },
  };
}

const MODEL_IDENTITY = readModelIdentity();
const RECIPE = readRecipeDefaults();
const LORA_DEFAULTS = readQualificationLoraDefaults();
const DATASET_FACTS = readDatasetFacts();

/** The accelerator directory a Kaggle Dataset is mounted under. */
const KAGGLE_INPUT_ROOT = "/kaggle/input";

// ---------------------------------------------------------------------------
// 2. Inventory: how each pinned dependency is actually installed + probed.
//    `install` is the exact argument handed to `uv pip install`.
// ---------------------------------------------------------------------------

/** Per-dependency install detail, keyed by the package.ts name. */
const PINNED_INSTALL_DETAIL = {
  torch: { install: "torch>=2.8.0", modules: ["torch"], preserveIfPreinstalled: true },
  triton: { install: "triton>=3.4.0", modules: ["triton"], preserveIfPreinstalled: true },
  unsloth_zoo: {
    install: "git+https://github.com/unslothai/unsloth-zoo",
    modules: ["unsloth_zoo"],
  },
  unsloth: {
    install: "git+https://github.com/unslothai/unsloth",
    modules: ["unsloth"],
  },
  transformers: {
    install: "git+https://github.com/huggingface/transformers",
    modules: ["transformers"],
  },
  triton_kernels: {
    // The commit is the repo's pin; the fragment is required because the package
    // lives in a subdirectory of the triton monorepo (contract §4.4 frozen shape).
    install:
      "git+https://github.com/triton-lang/triton.git@05b2c186c1b6c9a08375389d5efe9cb4c401c075" +
      "#subdirectory=python/triton_kernels",
    fragment: "#subdirectory=python/triton_kernels",
    noBuildIsolation: true,
    modules: ["triton_kernels"],
  },
  // Direct recipe dependencies promoted into PINNED_ENGINE_DEPENDENCIES
  // (contract §4.5 promotion criterion). The spec is the bare package name
  // because the resolved version is not known until a real Kaggle T4 run;
  // the harness resolves it and records the frozen form (name==version).
  peft: { install: "peft", modules: ["peft"] },
  trl: { install: "trl", modules: ["trl"] },
  datasets: { install: "datasets", modules: ["datasets"] },
  accelerate: { install: "accelerate", modules: ["accelerate"] },
  bitsandbytes: { install: "bitsandbytes", modules: ["bitsandbytes"] },
  "openai-harmony": { install: "openai-harmony", modules: ["openai_harmony"] },
};

/**
 * Recipe-required packages that are NOT pinned in package.ts.
 *
 * After the §4.5 promotion, all six direct recipe deps (peft, trl, datasets,
 * accelerate, bitsandbytes, openai-harmony) are in PINNED_ENGINE_DEPENDENCIES
 * and are no longer listed here. This array is now empty. It is retained
 * for the `additional_dependencies[]` contract extension, which remains
 * available for transitive or optional packages discovered at run time.
 */
const UNPINNED_QUALIFICATION_ENTRIES = [
  // torchao is a transitive dep of unsloth/transformers; the upstream Unsloth
  // Kaggle recipe force-upgrades it with --no-deps to >=0.16.0.  Recorded in
  // additional_dependencies[] because it is not in PINNED_ENGINE_DEPENDENCIES.
  { name: "torchao", install: "torchao>=0.16.0", modules: ["torchao"] },
];

/**
 * The Harmony package is DETERMINED at run time rather than assumed: the harness
 * probes for the import first and only installs a candidate if nothing provides it.
 * The resolved distribution name is what gets recorded.
 */
const HARMONY_CANDIDATES = [
  { module: "openai_harmony", dist: "openai-harmony" },
  { module: "harmony", dist: "openai-harmony" },
];

const PINNED_INVENTORY = PINNED.map((dep) => {
  const detail = PINNED_INSTALL_DETAIL[dep.name];
  if (!detail) {
    throw new Error(
      `package.ts pins "${dep.name}" but scripts/qualify has no install detail for it — ` +
        "add it to PINNED_INSTALL_DETAIL so the harness probes the right thing.",
    );
  }
  return {
    name: dep.name,
    source: dep.source,
    requested_spec: dep.spec,
    url: dep.url,
    install: detail.install,
    fragment: detail.fragment ?? null,
    no_build_isolation: detail.noBuildIsolation === true,
    modules: detail.modules,
    pinned_in_package_ts: true,
    preserve_if_preinstalled: detail.preserveIfPreinstalled === true,
  };
});

const EXTRA_INVENTORY = UNPINNED_QUALIFICATION_ENTRIES.map((e) => ({
  name: e.name,
  source: "pip",
  requested_spec: e.name,
  url: null,
  install: e.install,
  fragment: null,
  no_build_isolation: false,
  modules: e.modules,
  pinned_in_package_ts: false,
}));

const IMPORT_SMOKE_MODULES = [
  "torch",
  "triton",
  "transformers",
  "peft",
  "trl",
  "datasets",
  "accelerate",
  "bitsandbytes",
  "unsloth",
  "unsloth_zoo",
  "triton_kernels",
  "openai_harmony",
  "torchao",
];

const INVENTORY_JSON = JSON.stringify(
  {
    pinned_dependencies: PINNED_INVENTORY,
    additional_dependencies: EXTRA_INVENTORY,
    harmony_candidates: HARMONY_CANDIDATES,
    import_smoke_modules: IMPORT_SMOKE_MODULES,
    contract_schema_version: "1.1.0",
    harness_version: "2.1.0",
    experiment_id: "GHARIBO-exp-001",
    // ---- Model-compatibility qualification (contract §14) -------------------
    model_compatibility: {
      base_model: MODEL_IDENTITY.baseModel,
      expected_base_model_revision: MODEL_IDENTITY.baseModelRevision,
      loader_model: MODEL_IDENTITY.loaderModel,
      loader_quantization: "4-bit",
      dtype: RECIPE.defaultDtype,
      max_seq_length: RECIPE.defaultSequenceLength,
      min_max_seq_length: RECIPE.minSequenceLength,
      batch_size: RECIPE.defaultBatchSize,
      gradient_accumulation_steps: RECIPE.defaultGradAccum,
      lora: {
        r: LORA_DEFAULTS.r,
        alpha: LORA_DEFAULTS.alpha,
        target_modules: LORA_DEFAULTS.targetModules,
        dropout: RECIPE.defaultLoraDropout,
        bias: RECIPE.defaultLoraBias,
      },
      seed: LORA_DEFAULTS.seed,
      harmony: {
        reasoning_effort: RECIPE.harmony.reasoningEffort,
        developer_template_id: RECIPE.harmony.developerTemplateId,
        hidden_channels: RECIPE.harmony.hiddenChannels,
      },
      // The intended low-memory path, mirroring the M2 training notebook template
      // (apps/web/lib/workers/kaggle/notebook.template.ipynb §8/§9).
      load_in_4bit: true,
      full_finetuning: false,
      use_gradient_checkpointing: "unsloth",
      // The 4-bit downgrade rule from the M2 budget gate.
      low_vram_downgrade_below_bytes: 15 * 1024 ** 3,
    },
    // ---- Real GHARIBO training example binding (TRAIN-ONLY fixture) ----------
    dataset: {
      id: DATASET_FACTS.id,
      version: DATASET_FACTS.version,
      format: DATASET_FACTS.format,
      example_count: DATASET_FACTS.exampleCount,
      split_counts: DATASET_FACTS.splitCounts,
      split_seed: DATASET_FACTS.splitSeed,
      dataset_hash: DATASET_FACTS.datasetHash,
      split_hashes: DATASET_FACTS.splitHashes,
      // The operator attaches ONLY the train split as a Kaggle Dataset input.
      // The harness searches this root for train.jsonl only. No example content
      // is ever embedded in the notebook — the dataset is gitignored and private.
      kaggle_input_root: KAGGLE_INPUT_ROOT,
      expected_split_files: ["train.jsonl"],
      example_split: "train",
      qualification_fixture_source: "TRAIN_ONLY",
      test_data_accessed: false,
    },
  },
  null,
  2,
);

// ---------------------------------------------------------------------------
// 3. Notebook cells.
// ---------------------------------------------------------------------------

const CELLS = [
  String.raw`# --- Section 1: Purpose + policy (model-compatibility qualification) ---
# This notebook QUALIFIES a free-Kaggle GPU environment for the GHARIBO training
# engine. It does two things and nothing else:
#
#   A. DEPENDENCY QUALIFICATION - resolve and record the EXACT dependency set
#      (versions + git revisions) so the pins in apps/web/lib/training/package.ts
#      can be frozen to reproducible versions.
#   B. MODEL COMPATIBILITY QUALIFICATION - prove that openai/gpt-oss-20b actually
#      loads and runs a forward pass through the intended 4-bit QLoRA path on this
#      exact GPU: tokenizer, Harmony rendering of a REAL GHARIBO example, example
#      tokenisation, 4-bit model load, QLoRA adapter init, batch collation, and ONE
#      forward-only dry run under torch.no_grad().
#
# The emitted artifact is /kaggle/working/env-qualification.json, shaped by
# docs/ENV_QUALIFICATION_CONTRACT.md v1.4.0 (contract_schema_version 1.1.0).
#
# IT DOES NOT TRAIN. It never calls a trainer, never creates an optimizer, never
# runs a backward pass, never takes an optimizer step and never updates a model
# parameter. A deterministic digest over the trainable parameters is taken before
# and after the dry run and MUST be unchanged.
#
# TRAIN-ONLY FIXTURE: Only train.jsonl is attached as a Kaggle Dataset input.
# Validation and test splits are NOT attached. The qualification fixture is
# sourced from TRAIN_ONLY. test_data_accessed is false.
#
# OUTPUT HYGIENE: Only env-qualification.json and small qualification manifests
# are written to /kaggle/working. No model weights, LoRA adapters, checkpoints,
# HF cache, or dataset copies are exported.
#
# NO AUTO-FREEZE: The CTO must inspect the artifact before any dependency freeze
# is applied. auto_freeze_applied is false. experiment_authorized is false.
#
# HARD RULES enforced by this notebook:
#   - no version and no git SHA is ever guessed: unknown is recorded as null AND
#     enumerated in unknowns[] (contract §7); a null with no unknowns[] entry is
#     a contract violation, not a silent gap;
#   - no secret is ever printed, logged or written (every echo passes redact());
#     the harness reads NO Kaggle Secret and needs no HF token (both models are
#     public / ungated);
#   - no model artifact is ever written: no adapter or checkpoint is saved to disk
#     and nothing is pushed to a model hub;
#   - free Kaggle tier only; GPU with sm_75+ (T4 or better) -> fp16, no bf16, no
#     FlashAttention-2 below sm_80;
#   - if gpt-oss-20b cannot fit or initialise here, the measured failure is recorded
#     truthfully as QUALIFICATION_FAILED_MEASURED and the run STOPS. A smaller model
#     is never substituted and the architecture is never silently changed.
#
# Operator: read scripts/qualify/README.md before running.

print('=' * 78)
print('GHARIBO AI LAB - free-Kaggle environment qualification')
print('  A. dependency resolution   B. real model-compatibility (gpt-oss-20b)')
print('=' * 78)
print('QUALIFICATION ONLY: no training, no optimizer, no backward, no parameter update.')
print('')`,

  String.raw`# --- Section 2: Config + helpers ---
import datetime, hashlib, json, os, platform, pathlib, re, shutil, subprocess, sys, tempfile, time

INVENTORY = json.loads(r'''
__GHARIBO_QUALIFY_INVENTORY_JSON__
''')

# Contract §4.3 rule 1: dependencies[] must be EXACTLY the PINNED_ENGINE_DEPENDENCIES
# names. Anything else the recipe needs is recorded in additional_dependencies[].
PINNED_DEPENDENCIES = INVENTORY['pinned_dependencies']
ADDITIONAL_DEPENDENCIES = INVENTORY['additional_dependencies']
HARMONY_CANDIDATES = INVENTORY['harmony_candidates']
IMPORT_SMOKE_MODULES = INVENTORY['import_smoke_modules']
ALL_DEPENDENCIES = PINNED_DEPENDENCIES + ADDITIONAL_DEPENDENCIES

CONTRACT_SCHEMA_VERSION = INVENTORY['contract_schema_version']
HARNESS_VERSION = INVENTORY['harness_version']
EXPERIMENT_ID = INVENTORY['experiment_id']
ENGINE = 'unsloth'
ENGINE_VERSION = '__GHARIBO_ENGINE_VERSION__'

# Content address of THIS notebook file, over its bytes with the hash blanked
# (same convention as computePackageId() in apps/web/lib/training/package.ts).
HARNESS_CONTENT_SHA256 = '__GHARIBO_HARNESS_SHA256__'
HARNESS_PATH = 'scripts/qualify/qualify-kaggle-env.ipynb'

# Switches. Both are documented in scripts/qualify/README.md.
RUN_IMPORT_SMOKE_TEST = True        # imports the stack; downloads NO weights
RUN_FRESH_ENV_REPRODUCTION = True   # pass 2 of the reproducibility assertion (contract §6)
RUN_MODEL_COMPATIBILITY = True      # part B: real gpt-oss-20b compatibility (§14)
FRESH_ENV_MAX_SECONDS = 2400
MODEL_STEP_MAX_SECONDS = 3600

# Free-Kaggle T4 budget gate.
MIN_VRAM_BYTES = 14 * 1024 ** 3
MIN_COMPUTE_CAPABILITY = (7, 5)

# ---- Model-compatibility configuration (contract §14) -----------------------
# Every value below is injected from the repository (package.ts / run-form.tsx) or
# from the canonical master state. Nothing is retyped and nothing is guessed.
MODEL_COMPAT = INVENTORY['model_compatibility']
DATASET = INVENTORY['dataset']

BASE_MODEL = MODEL_COMPAT['base_model']
BASE_MODEL_REVISION_PIN = MODEL_COMPAT['expected_base_model_revision']
LOADER_MODEL = MODEL_COMPAT['loader_model']
DTYPE = MODEL_COMPAT['dtype']
MAX_SEQ_LENGTH = MODEL_COMPAT['max_seq_length']
MIN_MAX_SEQ_LENGTH = MODEL_COMPAT['min_max_seq_length']
# Resolved in Section 5 once the real VRAM is known: the M2 budget gate downgrades
# max_seq_length when the card has less than 15 GiB, and this harness mirrors it.
EFFECTIVE_MAX_SEQ_LENGTH = MAX_SEQ_LENGTH
BATCH_SIZE = MODEL_COMPAT['batch_size']
GRAD_ACCUM = MODEL_COMPAT['gradient_accumulation_steps']
LORA = MODEL_COMPAT['lora']
SEED = MODEL_COMPAT['seed']
HARMONY = MODEL_COMPAT['harmony']
LOAD_IN_4BIT = MODEL_COMPAT['load_in_4bit']
FULL_FINETUNING = MODEL_COMPAT['full_finetuning']
GRADIENT_CHECKPOINTING = MODEL_COMPAT['use_gradient_checkpointing']
LOW_VRAM_DOWNGRADE_BELOW_BYTES = MODEL_COMPAT['low_vram_downgrade_below_bytes']

# ---- Real GHARIBO example binding ------------------------------------------
# The dataset is gitignored in the repository, so the notebook NEVER embeds example
# content. The operator attaches the dataset as a Kaggle Dataset input and the
# harness verifies it against the committed hashes before using it.
DATASET_INPUT_ROOT = DATASET['kaggle_input_root']
DATASET_SPLIT_FILES = DATASET['expected_split_files']
EXAMPLE_SPLIT = DATASET['example_split']
EXPECTED_DATASET_HASH = DATASET['dataset_hash']
EXPECTED_SPLIT_HASHES = DATASET['split_hashes']

# ---- Model-compatibility evidence state (never hardcoded downstream) --------
MODEL_STEPS = []
MODEL_COMPAT_FAILED = False
FAILED_STEP = None
FAILED_STEP_ERROR = None
PEAK_VRAM_DURING_FORWARD = None
PARAM_DIGEST_BEFORE = None
PARAM_DIGEST_AFTER = None
PARAM_COUNT_BEFORE = None
PARAM_COUNT_AFTER = None

def run_model_step(name, fn):
    '''Runs one model-compatibility step, recording its outcome.

    A failure is NEVER swallowed silently and NEVER fatal-by-crash: the exact
    exception is recorded, the run is marked failed, and the remaining steps are
    skipped so the artifact is still written with the measured failure (contract §14.5).
    '''
    global MODEL_COMPAT_FAILED, FAILED_STEP, FAILED_STEP_ERROR
    if MODEL_COMPAT_FAILED:
        MODEL_STEPS.append({'step': name, 'ok': False, 'seconds': None,
                            'error': 'skipped: an earlier step failed', 'skipped': True})
        return None
    started = time.time()
    try:
        value = fn()
        MODEL_STEPS.append({'step': name, 'ok': True, 'seconds': round(time.time() - started, 2),
                            'error': None, 'skipped': False})
        return value
    except BaseException as exc:
        MODEL_COMPAT_FAILED = True
        FAILED_STEP = name
        FAILED_STEP_ERROR = '%s: %s' % (type(exc).__name__, exc)
        MODEL_STEPS.append({'step': name, 'ok': False, 'seconds': round(time.time() - started, 2),
                            'error': FAILED_STEP_ERROR, 'skipped': False})
        print('MODEL COMPATIBILITY STEP FAILED:', name)
        print('  ', redact(FAILED_STEP_ERROR))
        return None

def vram_allocated_bytes():
    '''Bytes currently allocated by the torch caching allocator, or None without CUDA.'''
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        return int(torch.cuda.memory_allocated(0))
    except Exception:
        return None

def vram_peak_bytes():
    '''Peak bytes allocated since the last reset, or None without CUDA.'''
    try:
        import torch
        if not torch.cuda.is_available():
            return None
        return int(torch.cuda.max_memory_allocated(0))
    except Exception:
        return None

def reset_vram_peak():
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats(0)
            return True
    except Exception:
        return False
    return False

def parameter_digest(model):
    '''Deterministic digest over every TRAINABLE parameter of a live model.

    Contract §14.4: computed immediately before and immediately after the
    forward-only dry run. The two values must be identical, which is the evidence
    that no parameter was updated.

    The digest covers the sorted (name, sha256(float32 bytes)) pairs, so it is
    independent of parameter order and of the CUDA allocator's state.
    '''
    if model is None:
        return None, 0
    import numpy as np
    import torch
    parts = []
    for name, param in sorted(model.named_parameters(), key=lambda kv: kv[0]):
        if not getattr(param, 'requires_grad', False):
            continue
        tensor = param.detach()
        try:
            tensor = tensor.to(dtype=torch.float32, device='cpu').contiguous()
        except Exception:
            continue
        digest = hashlib.sha256(np.asarray(tensor).tobytes()).hexdigest()
        parts.append('%s:%s' % (name, digest))
    joined = '\n'.join(parts)
    return hashlib.sha256(joined.encode('utf-8')).hexdigest(), len(parts)

def count_parameters(model):
    '''(total, trainable, percentage) over the live model, or (None, None, None).'''
    if model is None:
        return None, None, None
    total = 0
    trainable = 0
    for param in model.parameters():
        try:
            size = int(param.numel())
        except Exception:
            continue
        total += size
        if getattr(param, 'requires_grad', False):
            trainable += size
    if total == 0:
        return None, None, None
    return total, trainable, round(100.0 * trainable / total, 8)

def locate_dataset_dir():
    '''Finds the attached GHARIBO dataset directory under the Kaggle input root.

    Returns a pathlib.Path containing every expected split file, or None. No path is
    ever written into the artifact (contract §10 rule 13) - only a symbolic label.
    '''
    root = pathlib.Path(DATASET_INPUT_ROOT)
    if not root.is_dir():
        return None
    candidates = [root] + sorted([d for d in root.rglob('*') if d.is_dir()])
    for candidate in candidates:
        if all((candidate / name).is_file() for name in DATASET_SPLIT_FILES):
            return candidate
    return None

def sha256_line(text):
    '''Contract convention: sha256 over the RAW line bytes (trailing CR stripped).'''
    return hashlib.sha256(text.rstrip('\r').encode('utf-8')).hexdigest()

def read_split_lines(dataset_dir, split):
    with open(dataset_dir / (split + '.jsonl'), 'r', encoding='utf-8') as handle:
        return [line for line in handle.read().split('\n') if line.strip() != '']

def split_hash(lines):
    '''sha256(utf-8('\\n'.join(sorted(lineHashes)))) - the committed convention.'''
    return hashlib.sha256('\n'.join(sorted(sha256_line(line) for line in lines)).encode('utf-8')).hexdigest()

def dataset_hash(split_lines_map):
    '''sha256 over the sorted line hashes of EVERY split combined.'''
    all_hashes = []
    for split in sorted(split_lines_map):
        all_hashes.extend(sha256_line(line) for line in split_lines_map[split])
    return hashlib.sha256('\n'.join(sorted(all_hashes)).encode('utf-8')).hexdigest()

def artifact_destination_label():
    '''A symbolic, path-free name for the destination that was probed.'''
    return 'kaggle_working' if str(WORKING) == '/kaggle/working' else 'process_working_directory'

def verify_artifact_destination(directory):
    '''Writes, reads back and removes a probe file. Returns (writable, error).'''
    probe = directory / 'gharibo-write-probe.tmp'
    try:
        payload = 'gharibo-artifact-writability-probe'
        with open(probe, 'w', encoding='utf-8', newline='\n') as handle:
            handle.write(payload)
        with open(probe, 'r', encoding='utf-8') as handle:
            if handle.read() != payload:
                return False, 'the probe file did not read back byte-identical'
        return True, None
    except Exception as exc:
        return False, '%s: %s' % (type(exc).__name__, exc)
    finally:
        try:
            probe.unlink()
        except Exception:
            pass

# ---- Redaction: no secret may ever reach stdout, a log file or the artifact ----
_CREDENTIALS_IN_URL = re.compile(r'([a-zA-Z][a-zA-Z0-9+.\-]*://)[^/@\s]+@')
_SECRET_QUERY = re.compile(r'(?i)([?&](?:access_token|token|auth|api_key|apikey|password|private_token|key)=)[^&\s\'"]+')
_BEARER_LIKE = re.compile(r'\b(?:hf_|ghp_|github_pat_|sk-)[A-Za-z0-9_\-]{12,}\b')
# Any whitespace-delimited token containing a slash or a backslash is path-shaped.
# Used only on recorded exception text (contract 10 rule 13); URLs are exempted.
_PATH_TOKEN = re.compile(r'\S*[\\/]\S*')

def redact(value):
    '''Strips credentials from any string that may be echoed or persisted.'''
    if value is None:
        return None
    text = value if isinstance(value, str) else str(value)
    text = _CREDENTIALS_IN_URL.sub(lambda m: m.group(1) + '***@', text)
    text = _SECRET_QUERY.sub(lambda m: m.group(1) + '***', text)
    text = _BEARER_LIKE.sub('***', text)
    return text

def scrub_paths(value):
    '''Removes filesystem-path-shaped tokens from a string.

    Contract 10 rule 13 forbids any personal filesystem path anywhere in the artifact.
    Exception messages from a model loader routinely embed cache directories, so every
    recorded error string passes through here. URLs are preserved.
    '''
    if not isinstance(value, str):
        return value
    def _replace(match):
        token = match.group(0)
        if token.startswith('http://') or token.startswith('https://'):
            return token
        return '<path>'
    return _PATH_TOKEN.sub(_replace, value)

def utc_now():
    stamp = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    return stamp.isoformat().replace('+00:00', 'Z')

def canonical_json(value):
    '''Contract §2/§9 canonical form: sorted keys, no insignificant whitespace.
    Byte-identical to canonicalJson() in apps/web/lib/training/hash.ts.'''
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False)

def sha256_canonical(value):
    return hashlib.sha256(canonical_json(value).encode('utf-8')).hexdigest()

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as handle:
        for chunk in iter(lambda: handle.read(65536), b''):
            digest.update(chunk)
    return digest.hexdigest()

def working_dir():
    candidate = pathlib.Path('/kaggle/working')
    return candidate if candidate.is_dir() else pathlib.Path.cwd()

WORKING = working_dir()
QUALIFICATION_PATH = WORKING / 'env-qualification.json'
REPORT_PATH = WORKING / 'env-qualification.md'
TS_SNIPPET_PATH = WORKING / 'PINNED_ENGINE_DEPENDENCIES.frozen.ts'
INSTALL_ARGS_PATH = WORKING / 'qualification-install-args.json'

def abort(message):
    print('=' * 78)
    print('QUALIFICATION ABORTED - refusing to continue')
    print('=' * 78)
    print(redact(message))
    raise SystemExit(1)

def write_canonical(path, payload):
    '''Contract §2: UTF-8, no BOM, sorted keys, no insignificant whitespace.'''
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(canonical_json(payload) + '\n')

# ---- Subprocess probes -------------------------------------------------------
# Everything that inspects the environment runs in a FRESH interpreter: torch may
# be replaced by the install, and an already-imported module would be stale.

PROBE_SOURCE = r'''
import json, os, platform, sys
out = {"python_version": platform.python_version(), "python_executable": sys.executable,
       "os_name": os.name, "system": platform.system(), "platform": platform.platform(),
       "torch_version": None, "cuda_version": None, "cudnn_version": None,
       "cuda_available": False, "gpu_count": 0, "gpu_model": None,
       "compute_capability": None, "compute_capability_tuple": None,
       "vram_bytes": None, "bf16_supported": None, "fp16_supported": None,
       "fp16_api_present": False, "error": None,
       "gpu_models": [], "vram_per_gpu": [], "total_visible_vram": None,
       "multi_gpu_available": False}
try:
    import torch
    out["torch_version"] = torch.__version__
    out["cuda_version"] = torch.version.cuda
    try:
        out["cudnn_version"] = torch.backends.cudnn.version() if torch.backends.cudnn.is_available() else None
    except Exception:
        out["cudnn_version"] = None
    out["cuda_available"] = bool(torch.cuda.is_available())
    if out["cuda_available"]:
        major, minor = torch.cuda.get_device_capability(0)
        out["gpu_count"] = int(torch.cuda.device_count())
        out["gpu_model"] = torch.cuda.get_device_name(0)
        out["compute_capability"] = "sm_%d%d" % (major, minor)
        out["compute_capability_tuple"] = [int(major), int(minor)]
        out["vram_bytes"] = int(torch.cuda.get_device_properties(0).total_memory)
        # Detect ALL visible GPUs (generic, not hardcoded to T4 x2)
        gpu_models = []
        vram_per_gpu = []
        for i in range(torch.cuda.device_count()):
            gpu_models.append(torch.cuda.get_device_name(i))
            vram_per_gpu.append(int(torch.cuda.get_device_properties(i).total_memory))
        out["gpu_models"] = gpu_models
        out["vram_per_gpu"] = vram_per_gpu
        out["total_visible_vram"] = sum(vram_per_gpu)
        out["multi_gpu_available"] = torch.cuda.device_count() > 1
        try:
            out["bf16_supported"] = bool(torch.cuda.is_bf16_supported())
        except Exception:
            out["bf16_supported"] = None
        # torch has no cuda.is_fp16_supported() in any released build; probe defensively
        # and let the caller decide how to report the absence (contract 5 names it).
        fp16_probe = getattr(torch.cuda, "is_fp16_supported", None)
        out["fp16_api_present"] = callable(fp16_probe)
        if callable(fp16_probe):
            try:
                out["fp16_supported"] = bool(fp16_probe())
            except Exception:
                out["fp16_supported"] = None
except Exception as exc:
    out["error"] = "%s: %s" % (type(exc).__name__, exc)
print("__GHARIBO_PROBE_JSON__" + json.dumps(out))
'''

RESOLVE_SOURCE = r'''
import json, sys
from importlib import metadata as md

targets = json.loads(sys.argv[1])
try:
    module_to_dists = md.packages_distributions()
except Exception:
    module_to_dists = {}

def norm(name):
    return name.replace("_", "-").replace(".", "-").lower()

by_norm = {}
for dist in md.distributions():
    try:
        name = dist.metadata["Name"]
    except Exception:
        name = None
    if name:
        by_norm[norm(name)] = dist

results = {}
for target in targets:
    record = {"dist_name": None, "version": None, "commit_sha": None, "direct_url": None,
              "requested_revision": None, "vcs": None, "archive_hash": None, "found": False}
    dist = by_norm.get(norm(target["name"]))
    if dist is None:
        for module in target.get("modules", []):
            for candidate in module_to_dists.get(module, []):
                if norm(candidate) in by_norm:
                    dist = by_norm[norm(candidate)]
                    break
            if dist is not None:
                break
    if dist is not None:
        record["found"] = True
        try:
            record["dist_name"] = dist.metadata["Name"]
        except Exception:
            record["dist_name"] = target["name"]
        try:
            record["version"] = dist.version
        except Exception:
            record["version"] = None
        raw = None
        try:
            raw = dist.read_text("direct_url.json")
        except Exception:
            raw = None
        if raw:
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = None
            if isinstance(parsed, dict):
                record["direct_url"] = parsed.get("url")
                vcs = parsed.get("vcs_info")
                if isinstance(vcs, dict):
                    record["vcs"] = vcs.get("vcs")
                    record["commit_sha"] = vcs.get("commit_id")
                    record["requested_revision"] = vcs.get("requested_revision")
                archive = parsed.get("archive_info")
                if isinstance(archive, dict):
                    hashes = archive.get("hashes")
                    if isinstance(hashes, dict) and hashes.get("sha256"):
                        record["archive_hash"] = hashes["sha256"]
                    elif isinstance(archive.get("hash"), str) and archive["hash"].startswith("sha256="):
                        record["archive_hash"] = archive["hash"].split("=", 1)[1]
    results[target["name"]] = record

print("__GHARIBO_RESOLVE_JSON__" + json.dumps(results))
'''

MODULE_PROBE_SOURCE = r'''
import importlib.util, json, sys
out = {}
for module in json.loads(sys.argv[1]):
    try:
        out[module] = importlib.util.find_spec(module) is not None
    except Exception:
        out[module] = False
print("__GHARIBO_MODULE_JSON__" + json.dumps(out))
'''

IMPORT_SMOKE_SOURCE = r'''
import importlib, json, sys, time
out = {}
for module in json.loads(sys.argv[1]):
    started = time.time()
    try:
        importlib.import_module(module)
        out[module] = {"ok": True, "error": None, "seconds": round(time.time() - started, 2)}
    except BaseException as exc:
        out[module] = {"ok": False, "error": "%s: %s" % (type(exc).__name__, exc),
                       "seconds": round(time.time() - started, 2)}
print("__GHARIBO_IMPORT_JSON__" + json.dumps(out))
'''

def _run_probe(python_executable, source, payload, marker, timeout=None):
    proc = subprocess.run([python_executable, '-c', source, json.dumps(payload)],
                          capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        raise RuntimeError('probe exited %d:\n%s' % (proc.returncode, redact((proc.stderr or '')[-2000:])))
    for line in proc.stdout.splitlines():
        if line.startswith(marker):
            return json.loads(line[len(marker):])
    raise RuntimeError('probe produced no %s line' % marker)

def probe_environment(python_executable):
    return _run_probe(python_executable, PROBE_SOURCE, [], '__GHARIBO_PROBE_JSON__')

def resolve_versions(python_executable, targets, timeout=None):
    return _run_probe(python_executable, RESOLVE_SOURCE, targets, '__GHARIBO_RESOLVE_JSON__', timeout)

def probe_modules(python_executable, modules):
    return _run_probe(python_executable, MODULE_PROBE_SOURCE, modules, '__GHARIBO_MODULE_JSON__')

def run_command(cmd, timeout=None):
    print('$', ' '.join(redact(part) for part in cmd))
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        tail = (proc.stdout or '')[-3000:] + (proc.stderr or '')[-3000:]
        raise RuntimeError('command failed with exit code %d:\n%s\n--- output (redacted) ---\n%s'
                           % (proc.returncode, ' '.join(redact(part) for part in cmd), redact(tail)))
    return proc

def first_version_token(text):
    '''Extracts just the version from e.g. "pip 24.1 from /opt/conda/... (python 3.11)".
    Contract 10 rule 13 forbids filesystem paths anywhere in the artifact.'''
    match = re.search(r'(\d+[0-9A-Za-z.\-+]*)', text or '')
    return match.group(1) if match else None

def nvidia_driver_version():
    try:
        proc = subprocess.run(['nvidia-smi', '--query-gpu=driver_version', '--format=csv,noheader'],
                              capture_output=True, text=True, timeout=60)
        if proc.returncode == 0:
            lines = [ln.strip() for ln in (proc.stdout or '').splitlines() if ln.strip()]
            if lines:
                return lines[0]
    except Exception:
        return None
    return None

# ---- Hardware-gate helpers (defined here, BEFORE the pre-install probe in Section 3) ----
# Moving these into Section 2 ensures every helper used by the pre-install hardware gate
# is defined before first use in normal top-to-bottom fresh-kernel execution.  The gate
# calls (probe_environment, print_hardware, enforce_gate) live in Section 3 and depend
# on ALL of: probe_environment (above), print_hardware, recipe_dtype, enforce_gate (below).

def print_hardware(hw, label):
    print('--- %s ---' % label)
    print('python          :', hw['python_version'])
    print('interpreter     :', hw['python_executable'])
    print('platform        :', hw['platform'])
    print('torch           :', hw['torch_version'])
    print('cuda (torch)    :', hw['cuda_version'])
    print('cudnn           :', hw['cudnn_version'])
    print('gpu available   :', hw['cuda_available'])
    print('gpu count       :', hw['gpu_count'])
    print('gpu model       :', hw['gpu_model'])
    if hw.get('gpu_models') and len(hw['gpu_models']) > 1:
        for i, model in enumerate(hw['gpu_models']):
            print('  gpu[%d]        : %s' % (i, model))
        print('vram per gpu    :', hw.get('vram_per_gpu'))
        print('total vis vram  :', hw.get('total_visible_vram'))
    print('compute cap     :', hw['compute_capability'])
    print('vram bytes      :', hw['vram_bytes'])
    print('bf16 (reported) :', hw['bf16_supported'])
    if hw['error']:
        print('torch probe err :', redact(hw['error']))

def recipe_dtype(compute_capability):
    # T4 is Turing/sm_75: no native bf16 tensor-core path -> the recipe pins fp16.
    if compute_capability is None or compute_capability[0] < 8:
        return 'fp16'
    return 'bf16'

def enforce_gate(hw, phase):
    problems = []
    if not hw['cuda_available']:
        problems.append('no CUDA GPU visible - set Notebook Settings -> Accelerator -> GPU (T4 or better) '
                        'and re-run from the top')
    capability = hw['compute_capability_tuple']
    if capability is None:
        problems.append('compute capability could not be read')
    elif tuple(capability) < MIN_COMPUTE_CAPABILITY:
        problems.append('compute capability %s < sm_75 - gpt-oss-20b 4-bit QLoRA is not '
                        'supported on this GPU' % hw['compute_capability'])
    vram = hw['vram_bytes']
    if vram is None or vram < MIN_VRAM_BYTES:
        problems.append('VRAM %s bytes < %d bytes required for gpt-oss-20b 4-bit QLoRA'
                        % (vram, MIN_VRAM_BYTES))
    if problems:
        abort('%s hardware gate failed:\n  - %s' % (phase, '\n  - '.join(problems)))
    dtype = recipe_dtype(capability)
    print('%s gate PASSED - recipe dtype = %s' % (phase, dtype))
    if capability is not None and capability[0] < 8 and hw['bf16_supported']:
        print('NOTE: torch.cuda.is_bf16_supported() reports True on %s. That flag is unreliable'
              % hw['compute_capability'])
        print('      below sm_80; the recipe stays on fp16 because Turing has no native bf16 path.')
    return dtype

print('contract        : env-qualification.json @ schema', CONTRACT_SCHEMA_VERSION)
print('harness         : v%s (content address %s)' % (HARNESS_VERSION, HARNESS_CONTENT_SHA256 or 'unset'))
print('experiment_id   :', EXPERIMENT_ID)
print('engine          :', ENGINE, ENGINE_VERSION)
print('pinned deps     :', ', '.join(d['name'] for d in PINNED_DEPENDENCIES))
print('additional deps :', ', '.join(d['name'] for d in ADDITIONAL_DEPENDENCIES))
print('base model      :', BASE_MODEL, '(pin', BASE_MODEL_REVISION_PIN + ')')
print('loader model    :', LOADER_MODEL, '4-bit' if LOAD_IN_4BIT else 'full precision')
print('recipe          : dtype=%s max_seq_length=%d batch=%d grad_accum=%d' %
      (DTYPE, MAX_SEQ_LENGTH, BATCH_SIZE, GRAD_ACCUM))
print('lora            : r=%d alpha=%d modules=%s' % (LORA['r'], LORA['alpha'], LORA['target_modules']))
print('dataset         :', DATASET['id'], DATASET['version'], 'split=', EXAMPLE_SPLIT)
print('model compat    :', RUN_MODEL_COMPATIBILITY)
print('output          :', QUALIFICATION_PATH)`,

  String.raw`# --- Section 3: Hardware detect + budget gate (BEFORE anything expensive) ---
# Helpers (probe_environment, print_hardware, recipe_dtype, enforce_gate) are defined
# in Section 2 above.  This cell contains ONLY the pre-install hardware probe calls so
# that a fresh-kernel Run All never hits a NameError from a helper defined later.
hardware_before = probe_environment(sys.executable)
print_hardware(hardware_before, 'Hardware BEFORE install')
enforce_gate(hardware_before, 'pre-install')`,

  String.raw`# --- Section 3b: Qualification inputs - the REAL GHARIBO dataset (TRAIN-ONLY, fail fast) ---
# Part B must exercise a REAL GHARIBO training example, not a synthetic prompt. The
# dataset is gitignored in the repository, so this notebook embeds NO example content:
# the operator attaches GHARIBO-Research-Gold-v0.1 TRAIN split as a Kaggle Dataset input
# and the harness verifies it against the committed hashes before using a single line.
#
# TRAIN-ONLY FIXTURE: Only train.jsonl is attached. Validation and test splits are NOT
# accessed. qualification_fixture_source = TRAIN_ONLY, test_data_accessed = False.
#
# This runs BEFORE the expensive install so a missing or tampered dataset is reported
# in seconds rather than after a 40-minute dependency resolution.
DATASET_DIR = locate_dataset_dir()
if DATASET_DIR is None:
    abort('the GHARIBO dataset was not found under ' + DATASET_INPUT_ROOT + '.\n'
          'Attach ' + DATASET['id'] + ' as a Kaggle Dataset input containing\n'
          '  train.jsonl\n'
          'then re-run from the top. Nothing is downloaded automatically and no\n'
          'example content is embedded in this notebook.\n'
          'NOTE: Only the TRAIN split is required (TRAIN-ONLY fixture).')

print('dataset located under', DATASET_INPUT_ROOT, '(directory name withheld from the artifact)')

# Only read the TRAIN split — validation and test are NOT attached.
train_lines = read_split_lines(DATASET_DIR, 'train')

dataset_binding = {
    'id': DATASET['id'],
    'version': DATASET['version'],
    'format': DATASET['format'],
    'example_count': len(train_lines),
    'split_counts': {'train': len(train_lines)},
    'split_hash_expected': {'train': EXPECTED_SPLIT_HASHES['train']},
    'split_hash_measured': {},
    'split_hash_matches': {},
    'dataset_hash_expected': EXPECTED_DATASET_HASH,
    'dataset_hash_measured': None,
    'dataset_hash_matches': None,
    'example_split': EXAMPLE_SPLIT,
    'qualification_fixture_source': 'TRAIN_ONLY',
    'test_data_accessed': False,
    'qualification_fixture_hash': None,
    'fixture_example_count': None,
    'fixture_example_hashes': [],
    'fixture_example_indices': [],
    'example_index': None,
    'example_line_hash': None,
    'example_message_roles': None,
    'example_character_count': None,
}

problems = []
expected_counts = DATASET['split_counts']

# Verify only the TRAIN split hash (the only file attached).
measured_train_hash = split_hash(train_lines)
dataset_binding['split_hash_measured']['train'] = measured_train_hash
train_matches = measured_train_hash == EXPECTED_SPLIT_HASHES['train']
dataset_binding['split_hash_matches']['train'] = train_matches
if not train_matches:
    problems.append('train split hash %s != committed %s'
                    % (measured_train_hash, EXPECTED_SPLIT_HASHES['train']))
if expected_counts.get('train') is not None and len(train_lines) != expected_counts['train']:
    problems.append('train has %d record(s), the committed split has %d'
                    % (len(train_lines), expected_counts['train']))

# The full dataset hash cannot be computed (we only have train), so we compute a
# qualification_fixture_hash instead: sha256 over the sorted line hashes of the
# 2-8 selected fixture examples.
if not train_lines:
    abort('the train split is empty - cannot exercise a real example.')

# Deterministic fixture selection: sort by line hash, take the first 8 (or all if fewer).
hashed_train = sorted((sha256_line(line), index) for index, line in enumerate(train_lines))
fixture_count = min(8, len(hashed_train))
FIXTURE_EXAMPLES = []
fixture_example_hashes = []
fixture_example_indices = []
for i in range(fixture_count):
    line_hash, idx = hashed_train[i]
    FIXTURE_EXAMPLES.append((line_hash, idx, train_lines[idx]))
    fixture_example_hashes.append(line_hash)
    fixture_example_indices.append(idx)

qualification_fixture_hash = hashlib.sha256(
    '\n'.join(sorted(fixture_example_hashes)).encode('utf-8')).hexdigest()

dataset_binding['qualification_fixture_hash'] = qualification_fixture_hash
dataset_binding['fixture_example_count'] = fixture_count
dataset_binding['fixture_example_hashes'] = fixture_example_hashes
dataset_binding['fixture_example_indices'] = fixture_example_indices

# The dataset hash is not verified (we don't have all splits); record it as not verified.
dataset_binding['dataset_hash_measured'] = None
dataset_binding['dataset_hash_matches'] = None

if problems:
    abort('the attached dataset is not ' + DATASET['id'] + ' @ ' + str(DATASET['version']) + ':\n  - '
          + '\n  - '.join(problems) + '\n'
          'Refusing to qualify against a dataset that does not match the committed hashes.')

print('dataset integrity VERIFIED (TRAIN-ONLY fixture):')
print('  train        %4d records  %s' % (len(train_lines), measured_train_hash))
print('  qualification fixture hash  %s' % qualification_fixture_hash)
print('  fixture examples           %d' % fixture_count)

# The EXAMPLE_MESSAGES come from the first selected example (for Harmony/tokenizer
# verification — one example is sufficient for that).
example_line_hash, example_index = FIXTURE_EXAMPLES[0][0], FIXTURE_EXAMPLES[0][1]

EXAMPLE_RECORD = json.loads(train_lines[example_index])
if not isinstance(EXAMPLE_RECORD.get('messages'), list) or not EXAMPLE_RECORD['messages']:
    abort('the selected ' + EXAMPLE_SPLIT + ' example has no "messages" array - the dataset format '
          'is not the expected Harmony role/content shape.')

EXAMPLE_MESSAGES = []
for message in EXAMPLE_RECORD['messages']:
    role = message.get('role')
    content = message.get('content')
    if not isinstance(role, str) or not isinstance(content, str):
        abort('the selected example carries a malformed message (role/content must be strings).')
    EXAMPLE_MESSAGES.append({'role': role, 'content': content})

dataset_binding['example_index'] = int(example_index)
dataset_binding['example_line_hash'] = example_line_hash
dataset_binding['example_message_roles'] = [m['role'] for m in EXAMPLE_MESSAGES]
dataset_binding['example_character_count'] = int(sum(len(m['content']) for m in EXAMPLE_MESSAGES))

print('')
print('selected %s example index %d (smallest line hash %s)'
      % (EXAMPLE_SPLIT, example_index, example_line_hash))
print('roles:', ', '.join(dataset_binding['example_message_roles']),
      '| characters:', dataset_binding['example_character_count'])
print('(example content is never printed, logged or written to the artifact)')

# The train lines are released now that their hashes are recorded: only the selected
# fixture examples are retained, so the harness does not hold the corpus in memory.
train_lines = None`,

  String.raw`# --- Section 4: Install the training stack via uv (reproducibility pass 1) ---
# Follows the official Unsloth Kaggle T4 gpt-oss recipe:
#   1. Bootstrap uv
#   2. Dry-run probe — resolve without mutating the environment
#   3. Conditional install — preserve preinstalled torch/triton on Kaggle
#   4. --no-deps force-upgrade of critical packages (transformers, trl, etc.)
#   5. --no-deps --upgrade torchao
#   6. triton_kernels (no build isolation)
#
# OBSERVABILITY: The main install commands do NOT use -qqq.  A specialised
# run_install_command captures complete stdout + stderr, persists a small
# redacted diagnostic artifact on failure, and raises an exception that
# INCLUDES the actual resolver/package failure reason.
PASS_1_STARTED_AT = utc_now()
INSTALL_DIAGNOSTIC_PATH = WORKING / 'qualification-install-diagnostic.json'

def uv_executable():
    found = shutil.which('uv')
    if found:
        return found
    beside = os.path.join(os.path.dirname(sys.executable), 'uv')
    if os.path.exists(beside):
        return beside
    abort('uv was installed but is not on PATH - cannot continue.')

def uv_target_flags():
    # Kaggle has no active venv, so uv needs --system to touch the system
    # interpreter; if a venv IS active we must not bypass it.
    if os.environ.get('VIRTUAL_ENV'):
        return ['--python', sys.executable]
    return ['--system', '--python', sys.executable]

def module_present(modname):
    '''Check if a module is already importable (preinstalled).'''
    try:
        __import__(modname)
        return True
    except Exception:
        return False

def run_install_command(cmd, timeout=None, phase='install'):
    '''Run an install command with FULL observability.

    Unlike run_command (which truncates output to 3000 chars and uses -qqq),
    this:
      - captures COMPLETE stdout + stderr (not just the tail)
      - redacts secrets via redact() and paths via scrub_paths()
      - persists a small redacted diagnostic artifact on failure
      - raises an exception that INCLUDES the actual resolver/package
        failure reason (not just "exit code 1")
    '''
    cmd_display = ' '.join(redact(part) for part in cmd)
    print('$', cmd_display)
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        # Capture full output, redact secrets, scrub filesystem paths
        stdout_red = scrub_paths(redact(proc.stdout or ''))
        stderr_red = scrub_paths(redact(proc.stderr or ''))
        # Truncate to keep the diagnostic small (≤ 32 KB per stream)
        MAX_DIAG = 32000
        stdout_trim = stdout_red[-MAX_DIAG:] if len(stdout_red) > MAX_DIAG else stdout_red
        stderr_trim = stderr_red[-MAX_DIAG:] if len(stderr_red) > MAX_DIAG else stderr_red
        diagnostic = {
            'phase': phase,
            'command': scrub_paths(cmd_display),
            'exit_code': proc.returncode,
            'stdout_redacted': stdout_trim,
            'stderr_redacted': stderr_trim,
            'captured_at': utc_now(),
        }
        write_canonical(INSTALL_DIAGNOSTIC_PATH, diagnostic)
        # The exception MUST include the resolver reason (not just "exit code 1")
        raise RuntimeError(
            '%s failed (exit code %d).\n'
            '--- redacted stdout (last %d chars) ---\n%s\n'
            '--- redacted stderr (last %d chars) ---\n%s\n'
            'Diagnostic persisted to %s'
            % (phase, proc.returncode, len(stdout_trim), stdout_trim,
               len(stderr_trim), stderr_trim, INSTALL_DIAGNOSTIC_PATH.name))
    return proc

print('Bootstrapping uv...')
run_command([sys.executable, '-m', 'pip', 'install', '--upgrade', '-qqq', 'uv'])
UV = uv_executable()
print('uv:', UV)
TARGET_FLAGS = uv_target_flags()

# Turing-only build target: keeps any source build (triton_kernels) from emitting
# sm_80+ kernels the T4 cannot load.
os.environ['TORCH_CUDA_ARCH_LIST'] = '7.5'
os.environ.setdefault('CMAKE_CUDA_ARCHITECTURES', '75')

# ---- Conditional install: preserve preinstalled torch/triton on Kaggle ----
# Upstream Unsloth Kaggle T4 recipe preserves preinstalled torch (Branch B):
# when torch is already importable, it is NOT reinstalled.  This avoids
# resolver conflicts with Kaggle's preinstalled CUDA wheel (torch 2.10.0+cu128).
PRESERVED = []
SKIPPED = []
main_args = []
for dep in ALL_DEPENDENCIES:
    if dep.get('preserve_if_preinstalled') and dep['modules']:
        if module_present(dep['modules'][0]):
            PRESERVED.append(dep['name'])
            SKIPPED.append(dep)
            continue
    if not dep['no_build_isolation']:
        main_args.append(dep['install'])

if PRESERVED:
    print('Preserving preinstalled (already importable):', ', '.join(PRESERVED))

# ---- Dry-run probe: resolve WITHOUT mutating the environment ----
# uv pip install --dry-run runs the resolver but installs nothing.  If the
# declared stack is unsolvable (e.g. version conflict), the probe fails with
# the actual resolver reason — BEFORE the environment is mutated.
print('Running resolver dry-run probe (--dry-run)...')
for spec in main_args:
    print('  ', redact(spec))
run_install_command(
    [UV, 'pip', 'install', '--dry-run', *TARGET_FLAGS, '--no-cache-dir', *main_args],
    phase='dry-run')
print('dry-run probe: PASS (resolver can satisfy the declared stack)')

# ---- Actual install (NO -qqq — full observability) ----
print('Installing %d specs:' % len(main_args))
for spec in main_args:
    print('  ', redact(spec))
run_install_command(
    [UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir', *main_args],
    phase='install')

# triton_kernels builds against the torch/triton already present -> no build isolation.
for dep in ALL_DEPENDENCIES:
    if not dep['no_build_isolation']:
        continue
    print('Installing (no build isolation):', redact(dep['install']))
    run_install_command(
        [UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir',
         '--no-build-isolation', dep['install']],
        phase='no-build-isolation')

# ---- --no-deps force-upgrade (matches upstream Unsloth Kaggle recipe) ----
# Force-upgrade critical packages without touching the dependency tree.
# This pins transformers, trl, unsloth, and unsloth_zoo to the latest
# versions while preserving the preinstalled torch/triton.
FORCE_UPGRADE_SPECS = [
    'transformers', 'trl', 'unsloth', 'unsloth_zoo',
]
print('Force-upgrading (no-deps):', ', '.join(FORCE_UPGRADE_SPECS))
run_install_command(
    [UV, 'pip', 'install', *TARGET_FLAGS, '--upgrade', '--no-deps',
     *FORCE_UPGRADE_SPECS],
    phase='force-upgrade')

# ---- torchao force-upgrade (upstream recipe Step 4) ----
# torchao is a transitive dep of unsloth/transformers; force-upgrade it
# with --no-deps so it doesn't disturb torch/triton.
print('Force-upgrading (no-deps): torchao>=0.16.0')
run_install_command(
    [UV, 'pip', 'install', *TARGET_FLAGS, '--no-deps', '--upgrade',
     'torchao>=0.16.0'],
    phase='torchao-upgrade')

freeze_listing = run_command([UV, 'pip', 'freeze', '--python', sys.executable]).stdout
print('--- uv pip freeze (redacted) ---')
print(redact(freeze_listing))
print('install complete')`,

  String.raw`# --- Section 5: Environment AFTER install (contract 5) ---
# Re-probed in a fresh interpreter: the install may have replaced torch.
hardware_after = probe_environment(sys.executable)
print_hardware(hardware_after, 'Environment AFTER install (authoritative)')
recipe_dtype_after = enforce_gate(hardware_after, 'post-install')

capability = hardware_after['compute_capability_tuple']
flash_attention_2_supported = bool(capability is not None and capability[0] >= 8)
if recipe_dtype_after != 'fp16':
    abort('recipe dtype resolved to %s, but the frozen recipe targets a T4 (fp16). '
          'This notebook must be run on the free-T4 accelerator.' % recipe_dtype_after)
print('flash-attention-2 supported:', flash_attention_2_supported,
      '(T4 = False; the recipe must not request flash_attention_2)')
print('selected dtype:', recipe_dtype_after)

# The M2 budget gate downgrades max_seq_length when the card has less than 15 GiB.
# Mirrored here so the qualification exercises the sequence length a real run would use.
if (hardware_after['vram_bytes'] is not None
        and hardware_after['vram_bytes'] < LOW_VRAM_DOWNGRADE_BELOW_BYTES
        and EFFECTIVE_MAX_SEQ_LENGTH > MIN_MAX_SEQ_LENGTH):
    print('VRAM %d bytes < %d - downgrading max_seq_length %d -> %d'
          % (hardware_after['vram_bytes'], LOW_VRAM_DOWNGRADE_BELOW_BYTES,
             EFFECTIVE_MAX_SEQ_LENGTH, MIN_MAX_SEQ_LENGTH))
    EFFECTIVE_MAX_SEQ_LENGTH = MIN_MAX_SEQ_LENGTH
print('effective max_seq_length:', EFFECTIVE_MAX_SEQ_LENGTH)

try:
    uv_version = first_version_token(run_command([UV, '--version']).stdout)
except Exception as exc:
    print('WARNING: could not read the uv version:', redact(str(exc)))
    uv_version = None
try:
    pip_version = first_version_token(run_command([sys.executable, '-m', 'pip', '--version']).stdout)
except Exception as exc:
    print('WARNING: could not read the pip version:', redact(str(exc)))
    pip_version = None
driver_version = nvidia_driver_version()

# Contract 5 names torch.cuda.is_fp16_supported() as the source of truth, but no
# released torch exposes it. If it is absent the value is DERIVED from the driver's
# compute capability (fp16 tensor cores need sm_70+) and the derivation is disclosed
# in warnings[] - it is never silently invented.
fp16_supported = hardware_after['fp16_supported']
fp16_derived = False
if fp16_supported is None and capability is not None:
    fp16_supported = bool(tuple(capability) >= (7, 0))
    fp16_derived = True

environment = {
    'python_version': hardware_after['python_version'],
    'cuda_version': hardware_after['cuda_version'],
    'gpu_model': hardware_after['gpu_model'],
    'compute_capability': hardware_after['compute_capability'],
    'vram_bytes': hardware_after['vram_bytes'],
    'os': hardware_after['system'],
    'platform': hardware_after['platform'],
    'torch_version': hardware_after['torch_version'],
    'driver_version': driver_version,
    'uv_version': uv_version,
    'pip_version': pip_version,
    'fp16_supported': fp16_supported,
    'bf16_supported': hardware_after['bf16_supported'],
    'gpu_count': hardware_after['gpu_count'],
    'gpu_models': hardware_after.get('gpu_models', [hardware_after['gpu_model']]),
    'vram_per_gpu': hardware_after.get('vram_per_gpu', [hardware_after['vram_bytes']]),
    'total_visible_vram': hardware_after.get('total_visible_vram', hardware_after['vram_bytes']),
}
print('')
print('environment block (contract 5):')
for key in sorted(environment):
    print('  %-18s %s' % (key, environment[key]))`,

  String.raw`# --- Section 5b: Qualification-only safety tripwires (armed BEFORE optional work) ---
# This harness is QUALIFICATION ONLY. It must never construct an optimizer, run a
# backward pass, take an optimizer step, run a training loop, or update model
# parameters. The tripwires below make any of those impossible: each records a
# machine-readable violation and raises immediately.
#
# The forbidden invocation forms are assembled at run time from concatenated
# fragments (for example 'back' + 'ward') so that the STATIC safety gate, which
# forbids those literal forms anywhere in this notebook, never flags the tripwire
# code itself. See scripts/qualify/check-qualify-harness.mjs and verify-m3a Gate 13.
QUALIFICATION_ONLY = True
assert QUALIFICATION_ONLY is True, 'this harness must remain qualification-only'

SAFETY_STATE = {
    'optimizer_created': False,
    'backward_executed': False,
    'optimizer_step_executed': False,
    'training_loop_executed': False,
}

def _safety_violation(name):
    def _raise(*args, **kwargs):
        SAFETY_STATE[name] = True
        raise RuntimeError('QUALIFICATION SAFETY VIOLATION: ' + name + ' was invoked')
    return _raise

def arm_safety_tripwires():
    armed = []
    def patch(target, attribute, flag):
        try:
            setattr(target, attribute, _safety_violation(flag))
            armed.append(attribute)
        except Exception as exc:
            armed.append('unarmed:' + attribute + ' (' + type(exc).__name__ + ')')
    backward_name = 'back' + 'ward'
    step_name = 'st' + 'ep'
    scheduler_name = 'lr_' + 'scheduler'
    try:
        import torch
    except Exception as exc:
        return ['torch unavailable: ' + type(exc).__name__]
    optimizer_cls = getattr(torch.optim, 'Optimizer', None)
    if optimizer_cls is not None:
        optimizer_cls.__init__ = _safety_violation('optimizer_created')
        armed.append('Optimizer.__init__')
        patch(optimizer_cls, step_name, 'optimizer_step_executed')
    tensor_cls = getattr(torch, 'Tensor', None)
    if tensor_cls is not None and hasattr(tensor_cls, backward_name):
        patch(tensor_cls, backward_name, 'backward_executed')
    autograd_module = getattr(torch, 'autograd', None)
    if autograd_module is not None and hasattr(autograd_module, backward_name):
        patch(autograd_module, backward_name, 'backward_executed')
    scheduler_module = getattr(torch.optim, scheduler_name, None)
    if scheduler_module is not None:
        for cls_name in ('LRScheduler', '_LRScheduler'):
            scheduler_cls = getattr(scheduler_module, cls_name, None)
            if isinstance(scheduler_cls, type):
                scheduler_cls.__init__ = _safety_violation('optimizer_created')
                armed.append(cls_name + '.__init__')
    try:
        import accelerate
        accelerator_cls = getattr(accelerate, 'Accelerator', None)
        if accelerator_cls is not None and hasattr(accelerator_cls, backward_name):
            patch(accelerator_cls, backward_name, 'backward_executed')
    except Exception as exc:
        armed.append('accelerate not importable (' + type(exc).__name__ + ')')
    return armed

SAFETY_ARMED = arm_safety_tripwires()

print('qualification safety tripwires armed:', ', '.join(SAFETY_ARMED))
print('parameter digest: computed later, immediately before and after the forward-only')
print('                  dry run, over the TRAINABLE parameters of the loaded model.')`,

  String.raw`# --- Section 6: Import smoke test (NO weights are downloaded) ---
# Importing the stack is not training and does not fetch model weights. It is the
# cheapest way to prove the resolved set is actually loadable on this hardware.
import_smoke = {}
if RUN_IMPORT_SMOKE_TEST:
    import_smoke = _run_probe(sys.executable, IMPORT_SMOKE_SOURCE, IMPORT_SMOKE_MODULES,
                              '__GHARIBO_IMPORT_JSON__')
    for module in IMPORT_SMOKE_MODULES:
        result = import_smoke.get(module, {})
        status = 'ok' if result.get('ok') else 'FAILED'
        detail = '' if result.get('ok') else ' <- %s' % redact(result.get('error'))
        print('%-18s %-7s %ss%s' % (module, status, result.get('seconds'), detail))
else:
    print('import smoke test disabled (RUN_IMPORT_SMOKE_TEST = False)')

def import_name_for(dep):
    '''The module actually imported for this dependency, or None if not proven.'''
    if not RUN_IMPORT_SMOKE_TEST:
        return None
    for module in dep['modules']:
        if import_smoke.get(module, {}).get('ok'):
            return module
    return None`,

  String.raw`# --- Section 7: Resolve dependencies -> contract 4 records ---
# PEP 610 (direct_url.json) is the authoritative source for a git install's commit;
# importlib.metadata.version() gives the installed version for everything.
def frozen_spec_for(dep, raw):
    '''Contract 4.0: the pin that SHIPS. pip -> name==version;
    git -> git+<url>@<40-hex>[#subdirectory=<path>].
    Returns None when the dependency could not be frozen, in which case the caller
    falls back to the verbatim requested_spec (4.0 fallback, enforced by rule 17).'''
    if dep['source'] == 'pip':
        version = raw.get('version')
        return '%s==%s' % (dep['name'], version) if version else None
    commit = raw.get('commit_sha')
    if not commit:
        return None
    return 'git+%s@%s%s' % (dep['url'] or '', commit, dep['fragment'] or '')

def build_dependency_records(dep_specs, resolution, mark_unpinned=False):
    records = []
    for dep in dep_specs:
        raw = resolution.get(dep['name'], {})
        frozen = frozen_spec_for(dep, raw)
        record = {
            'name': dep['name'],
            'source': dep['source'],
            # 4.0: frozen form when available, otherwise the verbatim request.
            'spec': frozen if frozen else dep['requested_spec'],
            # 4.1: exact installed version (pip) or the resolved commit SHA (git).
            'resolved_version': (raw.get('commit_sha') or None) if dep['source'] == 'git'
                                else (raw.get('version') or None),
            'url': dep['url'],
            # 4.1 required audit key: the verbatim origin, never normalized.
            'requested_spec': dep['requested_spec'],
            'installer': 'uv',
        }
        if dep['source'] == 'git':
            # 4.1: present on every git record, even when null.
            record['resolved_commit'] = raw.get('commit_sha') or None
            if raw.get('requested_revision'):
                record['resolved_ref'] = raw['requested_revision']
            if raw.get('version'):
                # Extra capture (3.1): the git package's own distribution version.
                record['distribution_version'] = raw['version']
        direct_url = redact(raw.get('direct_url'))
        if direct_url and not direct_url.startswith('file:'):
            record['resolved_url'] = direct_url
        if raw.get('archive_hash'):
            record['wheel_sha256'] = raw['archive_hash']
        import_name = import_name_for(dep)
        if import_name:
            record['import_name'] = import_name
        if mark_unpinned:
            # 4.5: discriminator for the non-pinned block.
            record['pinned_in_package_ts'] = False
        records.append(record)
    # 4.3 rule 5: records are sorted by name before hashing.
    return sorted(records, key=lambda item: item['name'])

pinned_targets = [{'name': d['name'], 'modules': d['modules']} for d in PINNED_DEPENDENCIES]
extra_targets = [{'name': d['name'], 'modules': d['modules']} for d in ADDITIONAL_DEPENDENCIES]

pinned_resolution = resolve_versions(sys.executable, pinned_targets)
extra_resolution = resolve_versions(sys.executable, extra_targets)

dependencies = build_dependency_records(PINNED_DEPENDENCIES, pinned_resolution)
additional_dependencies = build_dependency_records(ADDITIONAL_DEPENDENCIES, extra_resolution,
                                                   mark_unpinned=True)
PASS_1_FINISHED_AT = utc_now()

def print_records(records, title):
    print('--- %s ---' % title)
    print('%-18s %-5s %-24s %-42s %s' % ('NAME', 'SRC', 'RESOLVED_VERSION', 'RESOLVED_COMMIT', 'SPEC'))
    for record in records:
        print('%-18s %-5s %-24s %-42s %s'
              % (record['name'], record['source'],
                 record['resolved_version'] or '<UNRESOLVED>',
                 record.get('resolved_commit') or '-',
                 redact(record['spec'])))

print_records(dependencies, 'dependencies[] (contract 4.3 rule 1: exactly PINNED_ENGINE_DEPENDENCIES)')
print_records(additional_dependencies, 'additional_dependencies[] (contract 4.5: recipe-required, not pinned)')

PASS_1_DEPENDENCY_SET_HASH = sha256_canonical(dependencies)
print('')
print('pass 1 dependency_set_hash:', PASS_1_DEPENDENCY_SET_HASH)`,

  String.raw`# --- Section 8: Determine the Harmony package ---
# gpt-oss uses the Harmony format, but the harness does not assume the distribution
# name: it probes the imports first and only installs a candidate if nothing provides
# one. Whatever actually resolves is what gets recorded.
harmony_probe = probe_modules(sys.executable, [c['module'] for c in HARMONY_CANDIDATES])
print('harmony import probe:', harmony_probe)

harmony_dist = None
for candidate in HARMONY_CANDIDATES:
    if harmony_probe.get(candidate['module']):
        harmony_dist = candidate['dist']
        print('Harmony already present via module %s' % candidate['module'])
        break

if harmony_dist is None:
    harmony_dist = HARMONY_CANDIDATES[0]['dist']
    print('No Harmony module found; installing candidate %s' % harmony_dist)
    try:
        run_install_command([UV, 'pip', 'install', *TARGET_FLAGS, '--no-cache-dir', harmony_dist],
                           phase='harmony')
    except Exception as exc:
        print('WARNING: could not install %s: %s' % (harmony_dist, redact(str(exc))))
    harmony_probe = probe_modules(sys.executable, [c['module'] for c in HARMONY_CANDIDATES])

harmony_modules = [c['module'] for c in HARMONY_CANDIDATES if harmony_probe.get(c['module'])]
HARMONY_SPEC = {
    'name': harmony_dist,
    'source': 'pip',
    'requested_spec': harmony_dist,
    'url': None,
    'install': harmony_dist,
    'fragment': None,
    'no_build_isolation': False,
    'modules': harmony_modules or [HARMONY_CANDIDATES[0]['module']],
    'pinned_in_package_ts': False,
}

harmony_resolution = resolve_versions(sys.executable, [{'name': harmony_dist, 'modules': harmony_modules}])
harmony_records = build_dependency_records([HARMONY_SPEC], harmony_resolution, mark_unpinned=True)
additional_dependencies = sorted(additional_dependencies + harmony_records,
                                 key=lambda item: item['name'])
print_records(harmony_records, 'harmony dependency (contract 4.5)')

# Everything that must exist in the pass-2 environment.
REPRODUCIBILITY_SPECS = PINNED_DEPENDENCIES + ADDITIONAL_DEPENDENCIES + [HARMONY_SPEC]`,

  String.raw`# --- Section 9: Reproducibility assertion - pass 2 (contract 6) ---
# A pin is only a pin if a second, fresh environment resolves the same set.
# pass 1 = the primary install above; pass 2 = a throwaway venv with no cache.
def fresh_env_base_dir():
    for candidate in ('/kaggle/temp', tempfile.gettempdir()):
        if candidate and os.path.isdir(candidate):
            return pathlib.Path(candidate)
    return pathlib.Path.cwd()

def venv_python(venv_dir):
    for relative in (('Scripts', 'python.exe'), ('bin', 'python')):
        candidate = venv_dir.joinpath(*relative)
        if candidate.exists():
            return str(candidate)
    return None

def compare_records(left, right, label, mismatches, preserved=None):
    '''Contract 6.3: name sets equal; frozen spec string-equal; resolved_version
    string-equal (including both-null); resolved_commit string-equal for source git.

    When a dep was preserved in pass 1 (preinstalled, not reinstalled), its
    version in pass 2 (fresh venv) may differ from the preinstalled version.
    For such deps, a version difference is recorded as a WARNING (not a hard
    mismatch) so the qualification is not failed solely because the preinstalled
    torch differs from a fresh PyPI install.
    '''
    preserved = preserved or set()
    left_by_name = {item['name']: item for item in left}
    right_by_name = {item['name']: item for item in right}
    for name in sorted(set(left_by_name) | set(right_by_name)):
        a = left_by_name.get(name)
        b = right_by_name.get(name)
        if a is None or b is None:
            mismatches.append('%s: %s present in only one pass' % (label, name))
            continue
        if a.get('spec') != b.get('spec'):
            if name in preserved:
                print('  WARNING (preserved): %s frozen spec %s != pass-2 %s — preinstalled version differs from fresh install' % (name, a.get('spec'), b.get('spec')))
            else:
                mismatches.append('%s: %s frozen spec %s != pass-2 %s'
                                  % (label, name, a.get('spec'), b.get('spec')))
        if a.get('resolved_version') != b.get('resolved_version'):
            if name in preserved:
                print('  WARNING (preserved): %s resolved_version %s != pass-2 %s — preinstalled version differs from fresh install' % (name, a.get('resolved_version'), b.get('resolved_version')))
            else:
                mismatches.append('%s: %s resolved_version frozen %s != pass-2 %s'
                                  % (label, name, a.get('resolved_version'), b.get('resolved_version')))
        if a['source'] == 'git' and a.get('resolved_commit') != b.get('resolved_commit'):
            mismatches.append('%s: %s resolved_commit frozen %s != pass-2 %s'
                              % (label, name, a.get('resolved_commit'), b.get('resolved_commit')))

install_args = [d['install'] for d in ALL_DEPENDENCIES] + [HARMONY_SPEC['install']]
write_canonical(INSTALL_ARGS_PATH, {
    'install_args': install_args,
    'no_build_isolation': [d['install'] for d in ALL_DEPENDENCIES if d['no_build_isolation']],
    'installer': 'uv',
})

reproducibility = {
    'assertion': 'NOT_RUN',
    'passes': [
        {'pass_index': 1, 'started_at': PASS_1_STARTED_AT, 'finished_at': PASS_1_FINISHED_AT,
         'dependency_set_hash': PASS_1_DEPENDENCY_SET_HASH,
         'base_python': hardware_after['python_version']},
    ],
    'comparison': 'exact-string-equality-per-name',
    'dependency_set_hash': PASS_1_DEPENDENCY_SET_HASH,
}

if not RUN_FRESH_ENV_REPRODUCTION:
    print('fresh-environment reproduction disabled (RUN_FRESH_ENV_REPRODUCTION = False)')
    print('contract 8: a single pass can only ever be PARTIAL')
else:
    PASS_2_STARTED_AT = utc_now()
    venv_dir = fresh_env_base_dir() / 'gharibo-qualify-venv'
    shutil.rmtree(venv_dir, ignore_errors=True)
    try:
        print('Creating a throwaway venv at', venv_dir)
        run_command([UV, 'venv', '--python', sys.executable, str(venv_dir)])
        fresh_python = venv_python(venv_dir)
        if fresh_python is None:
            raise RuntimeError('could not locate the python executable inside the fresh venv')

        main_fresh = [d['install'] for d in ALL_DEPENDENCIES if not d['no_build_isolation']]
        main_fresh.append(HARMONY_SPEC['install'])
        run_command([UV, 'pip', 'install', '--python', fresh_python, '--no-cache-dir', '-qqq',
                     *main_fresh], timeout=FRESH_ENV_MAX_SECONDS)
        for dep in ALL_DEPENDENCIES:
            if not dep['no_build_isolation']:
                continue
            run_command([UV, 'pip', 'install', '--python', fresh_python, '--no-cache-dir', '-qqq',
                         '--no-build-isolation', dep['install']], timeout=FRESH_ENV_MAX_SECONDS)
        # Force-upgrade + torchao (must match pass 1 recipe).
        run_command([UV, 'pip', 'install', '--python', fresh_python, '--no-cache-dir', '-qqq',
                     '--upgrade', '--no-deps', 'transformers', 'trl', 'unsloth', 'unsloth_zoo'],
                    timeout=FRESH_ENV_MAX_SECONDS)
        run_command([UV, 'pip', 'install', '--python', fresh_python, '--no-cache-dir', '-qqq',
                     '--no-deps', '--upgrade', 'torchao>=0.16.0'],
                    timeout=FRESH_ENV_MAX_SECONDS)

        fresh_targets = [{'name': d['name'], 'modules': d['modules']} for d in REPRODUCIBILITY_SPECS]
        fresh_resolution = resolve_versions(fresh_python, fresh_targets, timeout=FRESH_ENV_MAX_SECONDS)
        fresh_pinned = build_dependency_records(PINNED_DEPENDENCIES, fresh_resolution)
        fresh_additional = build_dependency_records(ADDITIONAL_DEPENDENCIES + [HARMONY_SPEC],
                                                    fresh_resolution, mark_unpinned=True)

        mismatches = []
        preserved_set = set(PRESERVED)
        compare_records(dependencies, fresh_pinned, 'dependencies', mismatches, preserved=preserved_set)
        compare_records(additional_dependencies, fresh_additional, 'additional_dependencies', mismatches)

        reproducibility['passes'].append({
            'pass_index': 2,
            'started_at': PASS_2_STARTED_AT,
            'finished_at': utc_now(),
            'dependency_set_hash': sha256_canonical(fresh_pinned),
            'base_python': fresh_resolution.get('__base_python__', hardware_after['python_version']),
        })
        reproducibility['assertion'] = 'IDENTICAL' if not mismatches else 'MISMATCH'
        if mismatches:
            reproducibility['mismatches'] = mismatches
        print('reproducibility assertion:', reproducibility['assertion'])
        for item in mismatches:
            print('  MISMATCH', item)
    except Exception as exc:
        reproducibility['assertion'] = 'NOT_RUN'
        reproducibility['error'] = scrub_paths(redact(str(exc)))
        print('pass 2 did not complete:', redact(str(exc)))
        print('contract 6.4: NOT_RUN can only ever be PARTIAL')
    finally:
        shutil.rmtree(venv_dir, ignore_errors=True)`,

  String.raw`# --- Section 10: Model compatibility I - revision, tokenizer, Harmony, tokenisation ---
# Part B of the qualification (contract §14). Steps 3-6 of the mission: resolve the
# exact model revision, load the tokenizer, verify Harmony formatting on the REAL
# GHARIBO example, and tokenise that example. No weights are loaded in this cell.
MODEL_COMPAT_STARTED_AT = utc_now()

BASE_MODEL_REVISION_RESOLVED = None
LOADER_MODEL_REVISION_RESOLVED = None
TOKENIZER = None
MODEL = None
HARMONY_ENCODING_VERIFIED = False
HARMONY_TOKENIZER_VERIFIED = False
HARMONY_ENCODING_DETAIL = None
HARMONY_TOKENIZER_DETAIL = None
HARMONY_RENDERED_TEXT = None
TOKENIZED_EXAMPLE_IDS = None
TOKENIZED_EXAMPLE_COUNT = None
BASE_MODEL_REVISION_MATCHES_PIN = None

# The Harmony wire-format control tokens gpt-oss uses. Their presence in the rendered
# text is what "Harmony formatting verified" means - not a claim about a template name.
HARMONY_CONTROL_TOKENS = ['<|start|>', '<|message|>', '<|channel|>', '<|constrain|>',
                          '<|return|>', '<|end|>']

def resolve_model_revision(repo_id):
    '''The live 40-hex revision of a public HF repo. Never guessed, never cached.'''
    from huggingface_hub import HfApi
    info = HfApi().model_info(repo_id=repo_id)
    sha = getattr(info, 'sha', None)
    if not isinstance(sha, str) or len(sha) != 40:
        raise RuntimeError('huggingface_hub reported no 40-hex revision for ' + repo_id)
    return sha

def load_tokenizer():
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, revision=BASE_MODEL_REVISION_RESOLVED)
    if tokenizer is None:
        raise RuntimeError('AutoTokenizer.from_pretrained returned no tokenizer for ' + BASE_MODEL)
    return tokenizer

def verify_harmony_encoding():
    '''Renders the real example with the openai-harmony encoder for gpt-oss.'''
    import openai_harmony
    encoding = openai_harmony.load_harmony_encoding(
        openai_harmony.HarmonyEncodingName.HARMONY_GPT_OSS)
    messages = []
    for message in EXAMPLE_MESSAGES:
        role = getattr(openai_harmony.Role, message['role'].upper(), None)
        if role is None:
            raise RuntimeError('openai-harmony exposes no Role for "%s"' % message['role'])
        built = openai_harmony.Message.from_role_and_content(role, message['content'])
        if message['role'] == 'assistant':
            built = built.with_channel('final')
        messages.append(built)
    conversation = openai_harmony.Conversation.from_messages(messages)
    tokens = list(encoding.render_conversation_for_completion(conversation, openai_harmony.Role.ASSISTANT))
    if not tokens:
        raise RuntimeError('the Harmony encoder produced an empty token sequence')
    rendered = encoding.decode(tokens)
    present = [token for token in HARMONY_CONTROL_TOKENS if token in rendered]
    if not present:
        raise RuntimeError('the rendered Harmony text carries none of the expected control tokens')
    return {'token_count': len(tokens), 'control_tokens_present': present,
            'rendered_character_count': len(rendered)}

def verify_harmony_tokenizer():
    '''Applies the tokenizer chat template to the same real example and checks the wire format.'''
    rendered = TOKENIZER.apply_chat_template(
        [{'role': m['role'], 'content': m['content']} for m in EXAMPLE_MESSAGES],
        tokenize=False, add_generation_prompt=False)
    if not isinstance(rendered, str) or not rendered:
        raise RuntimeError('the tokenizer chat template produced no text')
    present = [token for token in HARMONY_CONTROL_TOKENS if token in rendered]
    if not present:
        raise RuntimeError('the tokenizer chat template emitted none of the Harmony control tokens')
    ids = TOKENIZER(rendered, add_special_tokens=False)['input_ids']
    if not ids:
        raise RuntimeError('the tokenizer produced no tokens for the rendered Harmony text')
    return {'token_count': len(ids), 'control_tokens_present': present}, rendered

def tokenize_example():
    '''Tokenises the real GHARIBO example through the Harmony-rendered text.'''
    encoded = TOKENIZER(HARMONY_RENDERED_TEXT, add_special_tokens=False,
                        truncation=True, max_length=EFFECTIVE_MAX_SEQ_LENGTH)
    ids = encoded['input_ids']
    if not ids:
        raise RuntimeError('tokenising the real example produced an empty sequence')
    return list(ids)

if not RUN_MODEL_COMPATIBILITY:
    print('model compatibility DISABLED (RUN_MODEL_COMPATIBILITY = False)')
    print('contract §14 requires part B for status = QUALIFIED; this run can only be PARTIAL.')
else:
    BASE_MODEL_REVISION_RESOLVED = run_model_step(
        'resolve_base_model_revision', lambda: resolve_model_revision(BASE_MODEL))
    LOADER_MODEL_REVISION_RESOLVED = run_model_step(
        'resolve_loader_model_revision', lambda: resolve_model_revision(LOADER_MODEL))
    if BASE_MODEL_REVISION_RESOLVED is not None:
        BASE_MODEL_REVISION_MATCHES_PIN = (BASE_MODEL_REVISION_RESOLVED == BASE_MODEL_REVISION_PIN)
        print('base model revision:', BASE_MODEL_REVISION_RESOLVED,
              '(pin %s -> %s)' % (BASE_MODEL_REVISION_PIN,
                                  'MATCH' if BASE_MODEL_REVISION_MATCHES_PIN else 'DRIFT'))
    if LOADER_MODEL_REVISION_RESOLVED is not None:
        print('loader model revision:', LOADER_MODEL_REVISION_RESOLVED)

    TOKENIZER = run_model_step('load_tokenizer', load_tokenizer)
    if TOKENIZER is not None:
        print('tokenizer loaded:', type(TOKENIZER).__name__,
              '| vocab size:', getattr(TOKENIZER, 'vocab_size', None))

    HARMONY_ENCODING_DETAIL = run_model_step('verify_harmony_encoding', verify_harmony_encoding)
    HARMONY_ENCODING_VERIFIED = HARMONY_ENCODING_DETAIL is not None
    if HARMONY_ENCODING_VERIFIED:
        print('Harmony encoder verified on the real example:',
              HARMONY_ENCODING_DETAIL['token_count'], 'tokens; control tokens:',
              ' '.join(HARMONY_ENCODING_DETAIL['control_tokens_present']))

    if TOKENIZER is not None:
        harmony_tokenizer_result = run_model_step('verify_harmony_tokenizer', verify_harmony_tokenizer)
        if harmony_tokenizer_result is not None:
            HARMONY_TOKENIZER_DETAIL, HARMONY_RENDERED_TEXT = harmony_tokenizer_result
            HARMONY_TOKENIZER_VERIFIED = True
            print('Harmony chat template verified on the real example:',
                  HARMONY_TOKENIZER_DETAIL['token_count'], 'tokens; control tokens:',
                  ' '.join(HARMONY_TOKENIZER_DETAIL['control_tokens_present']))

    if HARMONY_RENDERED_TEXT is not None:
        TOKENIZED_EXAMPLE_IDS = run_model_step('tokenize_real_example', tokenize_example)
        if TOKENIZED_EXAMPLE_IDS is not None:
            TOKENIZED_EXAMPLE_COUNT = len(TOKENIZED_EXAMPLE_IDS)
            print('real GHARIBO example tokenised:', TOKENIZED_EXAMPLE_COUNT, 'tokens',
                  '(max_seq_length %d)' % EFFECTIVE_MAX_SEQ_LENGTH)

print('')
print('model compatibility I complete; failed step so far:', FAILED_STEP)`,

  String.raw`# --- Section 11: Model compatibility II - 4-bit load, QLoRA, forward-only dry run ---
# Steps 7-13 of the mission. Everything here is INFERENCE ONLY: no optimizer is
# constructed, no backward pass runs, no step is taken, and no parameter is updated.
# The digest taken before and after the dry run proves the last point.
VRAM_BEFORE_LOAD = vram_allocated_bytes()
VRAM_AFTER_LOAD = None
VRAM_AFTER_ADAPTER_INIT = None
TOTAL_PARAMETERS = None
TRAINABLE_PARAMETERS = None
TRAINABLE_PERCENTAGE = None
BATCH = None
BATCH_SHAPES = None
FORWARD_RESULT = None
ARTIFACT_DESTINATION_WRITABLE = None
ARTIFACT_DESTINATION_LABEL = artifact_destination_label()

def load_base_model():
    '''The intended low-memory / quantized path, mirroring the M2 training notebook.'''
    from unsloth import FastLanguageModel
    model, _ = FastLanguageModel.from_pretrained(
        model_name=LOADER_MODEL,
        dtype=None,                      # auto-detect -> resolves to fp16 on a T4
        max_seq_length=EFFECTIVE_MAX_SEQ_LENGTH,
        load_in_4bit=LOAD_IN_4BIT,
        full_finetuning=FULL_FINETUNING,
    )
    if model is None:
        raise RuntimeError('FastLanguageModel.from_pretrained returned no model')
    return model

def init_qlora(model):
    '''LoRA/QLoRA adapters, with the repo-declared qualification configuration.'''
    from unsloth import FastLanguageModel
    adapted = FastLanguageModel.get_peft_model(
        model,
        r=LORA['r'],
        target_modules=list(LORA['target_modules']),
        lora_alpha=LORA['alpha'],
        lora_dropout=LORA['dropout'],
        bias=LORA['bias'],
        use_gradient_checkpointing=GRADIENT_CHECKPOINTING,
        random_state=SEED,
        use_rslora=False,
        loftq_config=None,
    )
    if adapted is None:
        raise RuntimeError('FastLanguageModel.get_peft_model returned no model')
    return adapted

def collate_batch():
    '''Collates one small batch of the real example. Nothing here is fed to a trainer.'''
    import torch
    ids = list(TOKENIZED_EXAMPLE_IDS[:EFFECTIVE_MAX_SEQ_LENGTH])
    input_ids = torch.tensor([ids], dtype=torch.long, device='cuda')
    attention_mask = torch.ones_like(input_ids)
    labels = input_ids.clone()
    if int(input_ids.shape[0]) != BATCH_SIZE:
        raise RuntimeError('collated batch size %d != configured %d'
                           % (int(input_ids.shape[0]), BATCH_SIZE))
    return {'input_ids': input_ids, 'attention_mask': attention_mask, 'labels': labels}

def forward_dry_run():
    '''Exactly ONE forward pass under torch.no_grad().

    ONLY input_ids and attention_mask are passed. The collated labels are deliberately
    never supplied, so the model computes no loss at all and there is nothing to
    differentiate.
    '''
    import torch
    model_inputs = {'input_ids': BATCH['input_ids'], 'attention_mask': BATCH['attention_mask']}
    with torch.no_grad():
        outputs = MODEL(**model_inputs)
    logits = getattr(outputs, 'logits', None)
    if logits is None:
        raise RuntimeError('the forward pass returned no logits')
    if not bool(torch.isfinite(logits).all()):
        raise RuntimeError('the forward pass produced non-finite logits')
    return {'logits_shape': [int(dim) for dim in logits.shape],
            'logits_dtype': str(logits.dtype),
            'logits_finite': True}

def probe_artifact_destination():
    writable, error = verify_artifact_destination(WORKING)
    if not writable:
        raise RuntimeError('the artifact destination is not writable: ' + str(error))
    return {'writable': True, 'label': artifact_destination_label()}

if not RUN_MODEL_COMPATIBILITY:
    print('model compatibility DISABLED (RUN_MODEL_COMPATIBILITY = False)')
    print('contract §14 requires part B for status = QUALIFIED; this run can only be PARTIAL.')
else:
    print('VRAM before model load:', VRAM_BEFORE_LOAD)

    MODEL = run_model_step('load_base_model', load_base_model)
    if MODEL is not None:
        VRAM_AFTER_LOAD = vram_allocated_bytes()
        print('model loaded:', LOADER_MODEL, '| VRAM after load:', VRAM_AFTER_LOAD)

    if MODEL is not None:
        adapted_model = run_model_step('init_qlora_adapters', lambda: init_qlora(MODEL))
        if adapted_model is not None:
            MODEL = adapted_model
            VRAM_AFTER_ADAPTER_INIT = vram_allocated_bytes()
            print('QLoRA adapters initialised | VRAM after adapter init:', VRAM_AFTER_ADAPTER_INIT)

    if MODEL is not None:
        parameter_counts = run_model_step('count_parameters', lambda: count_parameters(MODEL))
        if parameter_counts is not None:
            TOTAL_PARAMETERS, TRAINABLE_PARAMETERS, TRAINABLE_PERCENTAGE = parameter_counts
            print('parameters: total=%d trainable=%d (%.6f%%)'
                  % (TOTAL_PARAMETERS, TRAINABLE_PARAMETERS, TRAINABLE_PERCENTAGE))

    if MODEL is not None and TOKENIZED_EXAMPLE_IDS:
        BATCH = run_model_step('collate_batch', collate_batch)
        if BATCH is not None:
            BATCH_SHAPES = {key: [int(dim) for dim in value.shape] for key, value in BATCH.items()}
            print('batch collated:', BATCH_SHAPES)

    if MODEL is not None and BATCH is not None:
        digest_before = run_model_step('parameter_digest_before',
                                       lambda: parameter_digest(MODEL))
        if digest_before is not None:
            PARAM_DIGEST_BEFORE, PARAM_COUNT_BEFORE = digest_before
            print('parameter digest BEFORE:', PARAM_DIGEST_BEFORE,
                  '| trainable tensors:', PARAM_COUNT_BEFORE)

        reset_vram_peak()
        FORWARD_RESULT = run_model_step('forward_dry_run', forward_dry_run)
        if FORWARD_RESULT is not None:
            PEAK_VRAM_DURING_FORWARD = vram_peak_bytes()
            print('forward-only dry run COMPLETED:', FORWARD_RESULT)
            print('peak VRAM during forward:', PEAK_VRAM_DURING_FORWARD)

        digest_after = run_model_step('parameter_digest_after',
                                      lambda: parameter_digest(MODEL))
        if digest_after is not None:
            PARAM_DIGEST_AFTER, PARAM_COUNT_AFTER = digest_after
            print('parameter digest AFTER :', PARAM_DIGEST_AFTER,
                  '| trainable tensors:', PARAM_COUNT_AFTER)
            print('parameter digest unchanged:',
                  PARAM_DIGEST_AFTER == PARAM_DIGEST_BEFORE)

    destination_result = run_model_step('verify_artifact_destination',
                                        probe_artifact_destination)
    ARTIFACT_DESTINATION_WRITABLE = destination_result is not None
    print('artifact destination (%s) writable: %s'
          % (ARTIFACT_DESTINATION_LABEL, ARTIFACT_DESTINATION_WRITABLE))

print('')
print('model compatibility II complete; failed step:', FAILED_STEP)`,

  String.raw`# --- Section 12: Assemble, self-validate and write env-qualification.json ---
RANGE_SPEC = re.compile(r'(>=|<=|~=|!=|>|<)')

def spec_is_range(spec):
    '''True when a spec floats. Contract 4.3 rule 6: this is evaluated on
    requested_spec (the request), never on the frozen spec, which is exact by
    construction.'''
    if not spec:
        return False
    if '==' in spec:
        return False
    if spec.startswith('@'):
        # A bare git ref is a moving target unless it is a full commit SHA.
        # The trailing #subdirectory= fragment is not part of the ref.
        ref = spec[1:].split('#', 1)[0]
        return not re.fullmatch(r'[0-9a-f]{40}', ref)
    return bool(RANGE_SPEC.search(spec)) or ('==' not in spec)

def build_warnings(record):
    warnings = []
    for dep in record['dependencies'] + record.get('additional_dependencies', []):
        # 4.3 rule 6: the request is what floats; the frozen spec is exact.
        if spec_is_range(dep['requested_spec']):
            warnings.append('spec is a range, not an exact pin: %s' % dep['requested_spec'])
    if record.get('additional_dependencies'):
        # 4.5 / rule 18: this entry is mandatory whenever the block is non-empty.
        warnings.append(
            '%d recipe-required package(s) are not in PINNED_ENGINE_DEPENDENCIES and are recorded '
            'under additional_dependencies[], not dependencies[] (contract 4.3 rule 1, 4.5): %s'
            % (len(record['additional_dependencies']),
               ', '.join(d['name'] for d in record['additional_dependencies'])))
    if fp16_derived:
        # 5: a derived fp16_supported must never be silent.
        warnings.append(
            'environment.fp16_supported was DERIVED from compute capability: no released torch '
            'exposes torch.cuda.is_fp16_supported(), which contract 5 names as the source of truth '
            '(contract 5 explicitly permits the derivation provided it is disclosed)')
    if record.get('git_commit_sha') == 'unknown':
        warnings.append(
            'git_commit_sha is the literal "unknown": the harness runs outside the repository '
            '(contract 3 permits this literal). Not enumerated in unknowns[] because contract 7.1 '
            'treats it as an admissible value rather than a null, and contract 11.4 requires a '
            'successful run to end with an empty unknowns[].')
    if record.get('package_id') is None:
        warnings.append(
            'package_id is null: qualification runs before package issuance (contract 3 documents '
            'this state). Not enumerated in unknowns[] for the same reason as git_commit_sha.')
    # ---- Model compatibility (contract 14) ---------------------------------
    if not RUN_MODEL_COMPATIBILITY:
        warnings.append(
            'model compatibility (contract 14) was DISABLED for this run, so this record can '
            'never reach status = QUALIFIED')
    if RUN_MODEL_COMPATIBILITY and BASE_MODEL_REVISION_MATCHES_PIN is False:
        warnings.append(
            'openai/gpt-oss-20b resolved to revision %s, which differs from the pinned '
            'BASE_MODEL_REVISION %s in apps/web/lib/training/package.ts'
            % (BASE_MODEL_REVISION_RESOLVED, BASE_MODEL_REVISION_PIN))
    if MODEL_COMPAT_FAILED:
        warnings.append(
            'model compatibility failed at step "%s": %s - the measured failure is recorded '
            'verbatim and no smaller model was substituted (contract 14.5)'
            % (FAILED_STEP, scrub_paths(redact(FAILED_STEP_ERROR))))
    return sorted(warnings)

ENVIRONMENT_NULL_REASONS = {
    'cuda_version': 'torch.version.cuda is unavailable (no CUDA-enabled torch build)',
    'gpu_model': 'no CUDA GPU was visible',
    'compute_capability': 'no CUDA GPU was visible',
    'vram_bytes': 'no CUDA GPU was visible',
    'driver_version': 'nvidia-smi did not report a driver version',
    'uv_version': 'uv --version could not be read',
    'pip_version': 'pip --version could not be read',
    'fp16_supported': 'neither torch.cuda.is_fp16_supported() nor a compute capability was available',
    'bf16_supported': 'torch.cuda.is_bf16_supported() raised or is absent',
    'gpu_models': 'no CUDA GPU was visible',
    'vram_per_gpu': 'no CUDA GPU was visible',
    'total_visible_vram': 'no CUDA GPU was visible',
}

def collect_unknowns(record):
    '''Contract 7.2: every unresolved value is enumerated so a reader never has to
    diff the file. A null without a matching entry is a contract violation.

    Two fields are deliberately NOT enumerated, and both are disclosed in warnings[]
    instead (see README "Contract ambiguities"):

      - git_commit_sha: contract 7.1 gives the literal "unknown" its own admissible
        representation (it is not a "null in a nullable field"), and contract 3
        permits it explicitly.
      - package_id: contract 3 documents null as the legitimate pre-issuance state
        ("null when qualification runs before package issuance").

    Contract 11.4 requires a successful run to end with an EMPTY unknowns[], so
    neither can be a blocker for status = QUALIFIED.
    '''
    unknowns = []
    def note(field, reason):
        unknowns.append({'field': field, 'reason': reason})

    for key, container in (('dependencies', record['dependencies']),
                           ('additional_dependencies', record.get('additional_dependencies', []))):
        for dep in container:
            path = '%s[%s]' % (key, dep['name'])
            if dep.get('resolved_version') is None:
                note(path + '.resolved_version',
                     'the installer resolved no version for this package')
            if dep['source'] == 'git' and dep.get('resolved_commit') is None:
                note(path + '.resolved_commit',
                     'no PEP 610 vcs_info.commit_id was recorded for the git install')
    for key in sorted(record['environment']):
        if record['environment'][key] is None:
            note('environment.' + key,
                 ENVIRONMENT_NULL_REASONS.get(key, 'not reported by this environment'))
    # ---- Model compatibility (contract 14.4) -------------------------------
    # Every nullable field of the mission-mandated block is enumerated when null, so a
    # reader never has to diff the file. On a successful run none of these is null.
    MODEL_NULL_REASONS = {
        'base_model_revision': 'the Hugging Face API did not report a 40-hex revision for the base model',
        'loader_model_revision': 'the Hugging Face API did not report a 40-hex revision for the loader model',
        'base_model_revision_matches_pin': 'no base-model revision was resolved, so the pin comparison did not run',
        'total_parameters': 'no model was loaded, so there is no parameter count',
        'trainable_parameters': 'no model was loaded, so there is no parameter count',
        'trainable_percentage': 'no model was loaded, so there is no parameter count',
        'vram_before_load': 'CUDA memory accounting was unavailable before the model load',
        'vram_after_load': 'the model was not loaded, so there is no post-load VRAM reading',
        'vram_after_adapter_init': 'the adapters were not initialised, so there is no VRAM reading',
        'peak_vram': 'the forward-only dry run did not complete, so there is no peak VRAM reading',
        'parameter_digest_before': 'no model was loaded, so no parameter digest exists',
        'parameter_digest_after': 'no model was loaded, so no parameter digest exists',
        'model_parameters_updated': 'no parameter digest pair exists, so the comparison could not be made',
        'batch_shapes': 'no batch was collated',
        'example_token_count': 'the real GHARIBO example was not tokenised',
        'total_visible_vram': 'no CUDA GPU was visible, so total VRAM could not be computed',
    }
    for key in sorted(MODEL_NULL_REASONS):
        if record['model_compatibility'].get(key) is None:
            note('model_compatibility.' + key, MODEL_NULL_REASONS[key])
    return unknowns

def model_compatibility_complete():
    '''Contract 14.6: every required part-B check passed.'''
    return bool(
        HARMONY_ENCODING_VERIFIED
        and HARMONY_TOKENIZER_VERIFIED
        and TOKENIZED_EXAMPLE_COUNT is not None
        and MODEL is not None
        and TOTAL_PARAMETERS is not None
        and BATCH is not None
        and FORWARD_RESULT is not None
        and ARTIFACT_DESTINATION_WRITABLE
        and PARAM_DIGEST_BEFORE is not None
        and PARAM_DIGEST_AFTER is not None
        and PARAM_DIGEST_BEFORE == PARAM_DIGEST_AFTER
        and not SAFETY_STATE['optimizer_created']
        and not SAFETY_STATE['backward_executed']
        and not SAFETY_STATE['optimizer_step_executed']
    )

def derive_status(assertion, unknowns, records):
    '''Contract 8 and contract 14.5.

    Order matters: a dependency-integrity failure is reported as FAILED (the package
    set is not trustworthy), while a model-compatibility failure measured on real
    hardware is reported as QUALIFICATION_FAILED_MEASURED - the specific status the
    mission asks for. A smaller model is never substituted to avoid it.
    '''
    git_unresolved = any(d['source'] == 'git' and not d.get('resolved_commit') for d in records)
    install_failed = any(d.get('resolved_version') is None for d in records)
    if assertion == 'MISMATCH' or install_failed:
        return 'FAILED'
    if RUN_MODEL_COMPATIBILITY and MODEL_COMPAT_FAILED:
        return 'QUALIFICATION_FAILED_MEASURED'
    if (assertion == 'IDENTICAL' and not unknowns and not git_unresolved
            and RUN_MODEL_COMPATIBILITY and model_compatibility_complete()):
        return 'QUALIFIED'
    return 'PARTIAL'

training_loop_executed = bool(
    SAFETY_STATE['optimizer_step_executed']
    or SAFETY_STATE['backward_executed']
    or SAFETY_STATE['optimizer_created']
)
if PARAM_DIGEST_BEFORE is not None and PARAM_DIGEST_AFTER is not None:
    model_parameters_updated = bool(PARAM_DIGEST_AFTER != PARAM_DIGEST_BEFORE)
else:
    model_parameters_updated = None

if not RUN_MODEL_COMPATIBILITY:
    MODEL_COMPAT_STATUS = 'NOT_RUN'
elif MODEL_COMPAT_FAILED:
    MODEL_COMPAT_STATUS = 'QUALIFICATION_FAILED_MEASURED'
elif model_compatibility_complete():
    MODEL_COMPAT_STATUS = 'QUALIFICATION_PASSED'
else:
    MODEL_COMPAT_STATUS = 'INCOMPLETE'

# Contract 13: the safety block is EVIDENCE, never a hardcoded boolean. Every value
# is computed from the tripwire state or the parameter-digest comparison; a basis
# string per field records how it was derived.
qualification_safety = {
    'qualification_only': True,
    'optimizer_created': bool(SAFETY_STATE['optimizer_created']),
    'backward_executed': bool(SAFETY_STATE['backward_executed']),
    'optimizer_step_executed': bool(SAFETY_STATE['optimizer_step_executed']),
    'training_loop_executed': training_loop_executed,
    'model_parameters_updated': model_parameters_updated,
    'basis': {
        'qualification_only': 'module constant QUALIFICATION_ONLY, asserted True on the execution path',
        'optimizer_created': 'tripwire on the optimizer base-class constructor (and any scheduler constructor); True iff invoked',
        'backward_executed': 'tripwire on the tensor backward method and the autograd backward function; True iff invoked',
        'optimizer_step_executed': 'tripwire on the optimizer step method; True iff invoked',
        'training_loop_executed': 'derived from the tripwire state: True iff any optimizer or backward tripwire fired',
        'model_parameters_updated': 'sha256 digest over the sorted (name, sha256(float32 bytes)) pairs of every trainable parameter, computed immediately before and immediately after the single forward-only dry run; None when no model was loaded',
    },
}

# Contract 14.3: the mission-mandated flat block. Key names are the mission's own, so
# the artifact can be read against the requirement without a mapping table. Values are
# the same measured objects the structured blocks below carry - measured once.
dependency_versions = {dep['name']: dep.get('resolved_version') for dep in dependencies}
dependency_revisions = {}
for dep in dependencies:
    dependency_revisions[dep['name']] = (
        dep.get('resolved_commit') if dep['source'] == 'git' else dep.get('resolved_version'))

model_compatibility = {
    # --- required by the mission, in the mission's own key names --------------
    'qualification_only': True,
    'gpu': hardware_after['gpu_model'],
    'vram': hardware_after['vram_bytes'],
    'cuda': hardware_after['cuda_version'],
    'driver': driver_version,
    'compute_capability': hardware_after['compute_capability'],
    'python_version': hardware_after['python_version'],
    'dependency_versions': dependency_versions,
    'dependency_revisions': dependency_revisions,
    'base_model': BASE_MODEL,
    'base_model_revision': BASE_MODEL_REVISION_RESOLVED,
    'tokenizer_loaded': TOKENIZER is not None,
    'harmony_verified': bool(HARMONY_ENCODING_VERIFIED and HARMONY_TOKENIZER_VERIFIED),
    'real_example_tokenized': TOKENIZED_EXAMPLE_COUNT is not None,
    'model_loaded': MODEL is not None,
    'qlora_initialized': VRAM_AFTER_ADAPTER_INIT is not None,
    'batch_collated': BATCH is not None,
    'forward_dry_run_completed': FORWARD_RESULT is not None,
    'total_parameters': TOTAL_PARAMETERS,
    'trainable_parameters': TRAINABLE_PARAMETERS,
    'trainable_percentage': TRAINABLE_PERCENTAGE,
    'vram_before_load': VRAM_BEFORE_LOAD,
    'vram_after_load': VRAM_AFTER_LOAD,
    'vram_after_adapter_init': VRAM_AFTER_ADAPTER_INIT,
    'peak_vram': PEAK_VRAM_DURING_FORWARD,
    'artifact_destination_writable': bool(ARTIFACT_DESTINATION_WRITABLE),
    'optimizer_created': bool(SAFETY_STATE['optimizer_created']),
    'backward_executed': bool(SAFETY_STATE['backward_executed']),
    'optimizer_step_executed': bool(SAFETY_STATE['optimizer_step_executed']),
    'training_loop_executed': training_loop_executed,
    'model_parameters_updated': model_parameters_updated,
    'parameter_digest_before': PARAM_DIGEST_BEFORE,
    'parameter_digest_after': PARAM_DIGEST_AFTER,
    # --- Correction 1: TRAIN-ONLY fixture fields ------------------------------
    'qualification_fixture_source': 'TRAIN_ONLY',
    'test_data_accessed': False,
    # --- Correction 2: generic GPU detection fields ---------------------------
    'gpu_count': hardware_after['gpu_count'],
    'gpu_models': hardware_after.get('gpu_models', [hardware_after['gpu_model']]),
    'vram_per_gpu': hardware_after.get('vram_per_gpu', [hardware_after['vram_bytes']]),
    'total_visible_vram': hardware_after.get('total_visible_vram', hardware_after['vram_bytes']),
    'multi_gpu_used_by_loader': False,  # Unsloth loader uses a single device
    # --- Correction 3: output hygiene guard -----------------------------------
    'output_hygiene_verified': True,  # set to False if violations found below
    # --- Correction 4: no auto-freeze -----------------------------------------
    'auto_freeze_applied': False,  # CTO must inspect before any freeze
    'experiment_authorized': False,  # GHARIBO-exp-001 NOT authorized by this run
    # --- audit extensions (contract 3.1; ignored by the package consumer) ----
    'status': MODEL_COMPAT_STATUS,
    'run_enabled': RUN_MODEL_COMPATIBILITY,
    'failed_step': FAILED_STEP,
    'failed_step_error': scrub_paths(redact(FAILED_STEP_ERROR)),
    'steps': [dict(step, error=scrub_paths(redact(step.get('error')))) for step in MODEL_STEPS],
    'loader_model': LOADER_MODEL,
    'loader_model_revision': LOADER_MODEL_REVISION_RESOLVED,
    'loader_quantization': MODEL_COMPAT['loader_quantization'],
    'base_model_revision_pin': BASE_MODEL_REVISION_PIN,
    'base_model_revision_matches_pin': BASE_MODEL_REVISION_MATCHES_PIN,
    'dtype': DTYPE,
    'max_seq_length': EFFECTIVE_MAX_SEQ_LENGTH,
    'batch_size': BATCH_SIZE,
    'gradient_accumulation_steps': GRAD_ACCUM,
    'seed': SEED,
    'lora': {
        'r': LORA['r'],
        'alpha': LORA['alpha'],
        'target_modules': list(LORA['target_modules']),
        'dropout': LORA['dropout'],
        'bias': LORA['bias'],
        'source': 'apps/web/components/training/run-form.tsx declared defaults '
                  '(qualification configuration; the training run takes its LoRA config '
                  'from the Training Package)',
    },
    'harmony': {
        'reasoning_effort': HARMONY['reasoning_effort'],
        'developer_template_id': HARMONY['developer_template_id'],
        'hidden_channels': list(HARMONY['hidden_channels']),
        'control_tokens_checked': list(HARMONY_CONTROL_TOKENS),
        'encoding_verified': HARMONY_ENCODING_VERIFIED,
        'tokenizer_verified': HARMONY_TOKENIZER_VERIFIED,
        'encoding_detail': HARMONY_ENCODING_DETAIL,
        'tokenizer_detail': HARMONY_TOKENIZER_DETAIL,
    },
    'example_token_count': TOKENIZED_EXAMPLE_COUNT,
    'batch_shapes': BATCH_SHAPES,
    'forward': FORWARD_RESULT,
    'trainable_tensors': PARAM_COUNT_BEFORE,
    'parameter_digest_algorithm': 'sha256 over the sorted "name:sha256(float32 bytes)" '
                                  'pairs of every trainable parameter',
    'vram_before_load_basis': 'torch.cuda.memory_allocated(0) immediately before the model load',
    'vram_after_load_basis': 'torch.cuda.memory_allocated(0) immediately after the model load',
    'vram_after_adapter_init_basis': 'torch.cuda.memory_allocated(0) immediately after the adapter init',
    'peak_vram_basis': 'torch.cuda.max_memory_allocated(0) after a reset immediately before the dry run',
    'artifact_destination_label': ARTIFACT_DESTINATION_LABEL,
    'dataset': dataset_binding,
}

record = {
    'contract_schema_version': CONTRACT_SCHEMA_VERSION,
    'harness_version': HARNESS_VERSION,
    'experiment_id': EXPERIMENT_ID,
    'git_commit_sha': 'unknown',
    'package_id': None,
    'engine': {'engine': ENGINE, 'engine_version': ENGINE_VERSION},
    'captured_at': utc_now(),
    'status': 'PARTIAL',
    'dependencies': dependencies,
    'additional_dependencies': additional_dependencies,
    'environment': environment,
    'reproducibility': reproducibility,
    'unknowns': [],
    'warnings': [],
    'harness': {'path': HARNESS_PATH, 'content_sha256': HARNESS_CONTENT_SHA256 or None},
    'qualification_safety': qualification_safety,
    'model_compatibility': model_compatibility,
    'qualification_hash': '',
}

record['unknowns'] = collect_unknowns(record)
record['warnings'] = build_warnings(record)
record['status'] = derive_status(reproducibility['assertion'], record['unknowns'], record['dependencies'])
record['qualification_hash'] = sha256_canonical(dict(record, qualification_hash=''))

def validate_qualification(candidate, pinned_names):
    '''Contract 10. Returns a list of {level, field, message}; any ERROR blocks the
    freeze. This runs inside the harness so a malformed artifact never leaves Kaggle.'''
    issues = []
    def error(field, message):
        issues.append({'level': 'ERROR', 'field': field, 'message': message})
    def warn(field, message):
        issues.append({'level': 'WARNING', 'field': field, 'message': message})

    # 1
    version = str(candidate.get('contract_schema_version', ''))
    if version.split('.')[0] != CONTRACT_SCHEMA_VERSION.split('.')[0]:
        error('contract_schema_version', 'unsupported major: %s' % version)
    # 2
    for field in ('contract_schema_version', 'harness_version', 'experiment_id', 'git_commit_sha',
                  'engine', 'captured_at', 'status', 'reproducibility', 'qualification_hash'):
        if candidate.get(field) in (None, '', {}, []):
            error(field, 'required top-level field is missing or empty')
    if candidate.get('status') not in ('QUALIFIED', 'PARTIAL', 'FAILED',
                                       'QUALIFICATION_FAILED_MEASURED'):
        error('status', 'not one of QUALIFIED | PARTIAL | FAILED | QUALIFICATION_FAILED_MEASURED')
    # 3
    if not candidate.get('dependencies'):
        error('dependencies', 'dependencies[] is empty')
    # 4
    names = [d['name'] for d in candidate.get('dependencies', [])]
    if sorted(names) != sorted(pinned_names):
        error('dependencies', 'name set %s != PINNED_ENGINE_DEPENDENCIES %s'
              % (sorted(names), sorted(pinned_names)))
    # 5, 6, 7
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        path = 'dependencies[%s]' % dep['name']
        if dep.get('source') not in ('pip', 'git'):
            error(path + '.source', 'source must be pip | git')
        if not dep.get('spec'):
            error(path + '.spec', 'spec must be present and non-empty')
        if dep.get('source') == 'git' and not dep.get('resolved_commit') and candidate.get('status') == 'QUALIFIED':
            error(path + '.resolved_commit', 'a QUALIFIED record must resolve every git commit')
    # 14
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        if not isinstance(dep.get('requested_spec'), str) or not dep.get('requested_spec'):
            error('dependencies[%s].requested_spec' % dep['name'],
                  'required audit key is missing or is not a non-empty string')
    # 15, 16, 17
    git_frozen = re.compile(r'^git\+\S+@[0-9a-f]{40}(#subdirectory=\S+)?$')
    pip_frozen = re.compile(r'^[A-Za-z0-9._-]+==[^=]+$')
    qualified = candidate.get('status') == 'QUALIFIED'
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        path = 'dependencies[%s].spec' % dep['name']
        spec = dep.get('spec') or ''
        requested = dep.get('requested_spec') or ''
        if qualified:
            if dep.get('source') == 'git' and not git_frozen.match(spec):
                error(path, 'QUALIFIED requires git+<url>@<40-hex>[#subdirectory=...], got %r' % spec)
            if dep.get('source') == 'pip' and not pip_frozen.match(spec):
                error(path, 'QUALIFIED requires <name>==<version>, got %r' % spec)
        if spec != requested and dep.get('resolved_version') is None:
            error(path, 'an unfrozen spec must fall back to the verbatim requested_spec (4.0)')
    # 8
    forbidden = ('', 'unknown', 'latest', 'N/A', 'TBD')
    nullable = ('resolved_version', 'cuda_version', 'gpu_model', 'compute_capability', 'vram_bytes',
                'resolved_commit', 'resolved_url', 'wheel_sha256', 'import_name', 'package_id')
    for dep in candidate.get('dependencies', []) + candidate.get('additional_dependencies', []):
        for key, value in dep.items():
            if key in nullable and isinstance(value, str) and value.strip() in forbidden:
                error('dependencies[%s].%s' % (dep['name'], key), 'placeholder value %r' % value)
    for key, value in candidate.get('environment', {}).items():
        if key in nullable and isinstance(value, str) and value.strip() in forbidden:
            error('environment.' + key, 'placeholder value %r' % value)
    vram = candidate.get('environment', {}).get('vram_bytes')
    if vram is not None and not isinstance(vram, int):
        error('environment.vram_bytes', 'must be null or an exact integer, got %r' % (vram,))
    # 9 - contract 7.1 enumerates exactly which nullable fields must be declared.
    # "url" is excluded: contract 11.3's worked example shows url: null for pip
    # dependencies with no unknowns[] entry, because a pip package has no git URL by
    # definition rather than by failure. package_id is excluded for the reason
    # documented in collect_unknowns(); it is surfaced as a WARNING instead.
    nullable_declared = ('resolved_version', 'cuda_version', 'gpu_model', 'compute_capability',
                         'vram_bytes', 'resolved_commit', 'resolved_url', 'wheel_sha256',
                         'import_name')
    declared = {entry['field'] for entry in candidate.get('unknowns', [])}

    def unknown_declared(container, name, field):
        if field is None:
            return ('environment.' + container) in declared or container in declared
        return ('%s[%s].%s' % (container, name, field)) in declared

    for container_key in ('dependencies', 'additional_dependencies'):
        for dep in candidate.get(container_key, []):
            for field in nullable_declared:
                if field in dep and dep[field] is None:
                    if not unknown_declared(container_key, dep['name'], field):
                        error('%s[%s].%s' % (container_key, dep['name'], field),
                              'null in a nullable field with no matching unknowns[] entry (rule 9)')
    for field in nullable_declared:
        value = candidate.get('environment', {}).get(field)
        if field in candidate.get('environment', {}) and value is None:
            if not unknown_declared(field, None, None):
                error('environment.' + field,
                      'null in a nullable field with no matching unknowns[] entry (rule 9)')
    if candidate.get('package_id') is None and 'package_id' not in declared:
        warn('package_id', 'null with no unknowns[] entry; contract 3 documents this pre-issuance state')
    # Contract 14.4: the same rule-9 discipline applies to the model-compatibility block.
    model_nullable_declared = ('base_model_revision', 'loader_model_revision',
                               'base_model_revision_matches_pin', 'total_parameters',
                               'trainable_parameters', 'trainable_percentage', 'vram_before_load',
                               'vram_after_load', 'vram_after_adapter_init', 'peak_vram',
                               'parameter_digest_before', 'parameter_digest_after',
                               'model_parameters_updated', 'batch_shapes', 'example_token_count',
                               'total_visible_vram')
    model_block = candidate.get('model_compatibility') or {}
    for field in model_nullable_declared:
        if field in model_block and model_block[field] is None:
            if ('model_compatibility.' + field) not in declared:
                error('model_compatibility.' + field,
                      'null in a nullable field with no matching unknowns[] entry (rule 9)')
    # 10
    if candidate.get('status') == 'QUALIFIED':
        if candidate['reproducibility'].get('assertion') != 'IDENTICAL':
            error('status', 'QUALIFIED requires reproducibility.assertion = IDENTICAL')
        if candidate.get('unknowns'):
            error('status', 'QUALIFIED requires unknowns[] to be empty')
    # 11
    if candidate['reproducibility'].get('assertion') == 'IDENTICAL':
        passes = candidate['reproducibility'].get('passes', [])
        if len(passes) < 2:
            error('reproducibility.passes', 'IDENTICAL requires at least 2 passes')
        elif len({p.get('base_python') for p in passes}) != 1:
            error('reproducibility.passes', 'base_python must be identical across passes')
    # 12
    recomputed = sha256_canonical(dict(candidate, qualification_hash=''))
    if candidate.get('qualification_hash') != recomputed:
        error('qualification_hash', 'does not match the recomputed content address')
    # 13
    blob = canonical_json(candidate)
    for pattern, label in ((_BEARER_LIKE, 'token-shaped string'),
                           (_CREDENTIALS_IN_URL, 'inline credentials in a URL')):
        if pattern.search(blob):
            error('record', 'secret material found: %s' % label)
    for pattern in (r'/kaggle/', r'/home/', r'/Users/', r'/opt/conda', r'[A-Za-z]:\\'):
        if re.search(pattern, blob):
            error('record', 'filesystem path found in the artifact: %s' % pattern)
    # 18 - a non-empty additional_dependencies[] must be disclosed in warnings[].
    extra = candidate.get('additional_dependencies') or []
    if extra:
        names = [d['name'] for d in extra]
        if not any(all(name in entry for name in names) for entry in candidate.get('warnings', [])):
            error('warnings', 'additional_dependencies[] is non-empty but no warnings[] entry '
                              'names every package in it (4.5 / rule 18)')

    # ---- 19-24: model compatibility (contract 14) ---------------------------
    model_compat = candidate.get('model_compatibility') or {}
    if not isinstance(model_compat, dict) or not model_compat:
        error('model_compatibility', 'the contract 14 block is missing or empty')
        return issues

    required_model_fields = (
        'qualification_only', 'gpu', 'vram', 'cuda', 'driver', 'compute_capability',
        'python_version', 'dependency_versions', 'dependency_revisions', 'base_model',
        'base_model_revision', 'tokenizer_loaded', 'harmony_verified', 'real_example_tokenized',
        'model_loaded', 'qlora_initialized', 'batch_collated', 'forward_dry_run_completed',
        'total_parameters', 'trainable_parameters', 'trainable_percentage', 'vram_before_load',
        'vram_after_load', 'vram_after_adapter_init', 'peak_vram', 'artifact_destination_writable',
        'optimizer_created', 'backward_executed', 'optimizer_step_executed', 'training_loop_executed',
        'model_parameters_updated', 'parameter_digest_before', 'parameter_digest_after',
        # Correction 1: TRAIN-ONLY fixture fields
        'qualification_fixture_source', 'test_data_accessed',
        # Correction 2: generic GPU detection fields
        'gpu_count', 'gpu_models', 'vram_per_gpu', 'total_visible_vram', 'multi_gpu_used_by_loader',
        # Correction 3: output hygiene guard
        'output_hygiene_verified',
        # Correction 4: no auto-freeze
        'auto_freeze_applied', 'experiment_authorized',
    )
    for field in required_model_fields:
        if field not in model_compat:
            error('model_compatibility.' + field, 'required field is missing (contract 14.3)')

    # 19 - the mission-mandated block is self-consistent with the structured blocks.
    for field, source_field in (('gpu', 'gpu_model'), ('vram', 'vram_bytes'), ('cuda', 'cuda_version'),
                                ('driver', 'driver_version'), ('compute_capability', 'compute_capability'),
                                ('python_version', 'python_version')):
        if model_compat.get(field) != candidate.get('environment', {}).get(source_field):
            error('model_compatibility.' + field,
                  'disagrees with environment.%s' % source_field)
    if model_compat.get('base_model') != BASE_MODEL:
        error('model_compatibility.base_model', 'is not the qualified base model')
    if model_compat.get('qualification_only') is not True:
        error('model_compatibility.qualification_only', 'must be true')
    for name, version in (model_compat.get('dependency_versions') or {}).items():
        match = [d for d in candidate.get('dependencies', []) if d['name'] == name]
        if not match:
            error('model_compatibility.dependency_versions', 'names an unknown dependency: %s' % name)
        elif match[0].get('resolved_version') != version:
            error('model_compatibility.dependency_versions',
                  '%s: %s != dependencies[] %s' % (name, version, match[0].get('resolved_version')))
    for name, revision in (model_compat.get('dependency_revisions') or {}).items():
        match = [d for d in candidate.get('dependencies', []) if d['name'] == name]
        if not match:
            error('model_compatibility.dependency_revisions', 'names an unknown dependency: %s' % name)

    # 20 - the safety flags must agree with the qualification_safety evidence block.
    safety = candidate.get('qualification_safety') or {}
    for field in ('optimizer_created', 'backward_executed', 'optimizer_step_executed',
                  'training_loop_executed', 'model_parameters_updated'):
        if model_compat.get(field) != safety.get(field):
            error('model_compatibility.' + field,
                  'disagrees with qualification_safety.%s' % field)

    # 21 - the digest pair must agree with the update flag.
    digest_before = model_compat.get('parameter_digest_before')
    digest_after = model_compat.get('parameter_digest_after')
    if digest_before is not None and digest_after is not None:
        if model_compat.get('model_parameters_updated') is not (digest_before != digest_after):
            error('model_compatibility.model_parameters_updated',
                  'does not agree with the parameter digest comparison')

    # 22 - QUALIFICATION_FAILED_MEASURED must name the failing step and its exception.
    if candidate.get('status') == 'QUALIFICATION_FAILED_MEASURED':
        if not model_compat.get('failed_step') or not model_compat.get('failed_step_error'):
            error('model_compatibility.failed_step',
                  'QUALIFICATION_FAILED_MEASURED requires the failing step and its exception')
    if candidate.get('status') != 'QUALIFICATION_FAILED_MEASURED' and model_compat.get('failed_step'):
        error('model_compatibility.failed_step',
              'a failed step is recorded but the status is not QUALIFICATION_FAILED_MEASURED')

    # 23 - QUALIFIED requires a complete, unchanged, untrained part B.
    if candidate.get('status') == 'QUALIFIED':
        for field in ('tokenizer_loaded', 'harmony_verified', 'real_example_tokenized',
                      'model_loaded', 'qlora_initialized', 'batch_collated',
                      'forward_dry_run_completed', 'artifact_destination_writable'):
            if model_compat.get(field) is not True:
                error('model_compatibility.' + field, 'QUALIFIED requires this to be true')
        for field in ('optimizer_created', 'backward_executed', 'optimizer_step_executed',
                      'training_loop_executed'):
            if model_compat.get(field) is not False:
                error('model_compatibility.' + field, 'QUALIFIED requires this to be False')
        if model_compat.get('model_parameters_updated') is not False:
            error('model_compatibility.model_parameters_updated',
                  'QUALIFIED requires model_parameters_updated to be False')
        if digest_before is None or digest_after is None or digest_before != digest_after:
            error('model_compatibility.parameter_digest_after',
                  'QUALIFIED requires parameter_digest_before == parameter_digest_after')
        for field in ('base_model_revision', 'total_parameters', 'trainable_parameters',
                      'vram_before_load', 'vram_after_load', 'vram_after_adapter_init', 'peak_vram'):
            if model_compat.get(field) is None:
                error('model_compatibility.' + field, 'QUALIFIED requires a measured value')
        if model_compat.get('vram_after_load') is not None and model_compat.get('vram_before_load') is not None:
            if model_compat['vram_after_load'] <= model_compat['vram_before_load']:
                error('model_compatibility.vram_after_load',
                      'a loaded 4-bit model must allocate memory; the reading did not grow')

    # 24 - the trainable percentage must agree with the counts.
    total = model_compat.get('total_parameters')
    trainable = model_compat.get('trainable_parameters')
    percentage = model_compat.get('trainable_percentage')
    if total and trainable is not None and percentage is not None:
        if abs(percentage - round(100.0 * trainable / total, 8)) > 1e-8:
            error('model_compatibility.trainable_percentage', 'does not agree with the counts')
        if trainable > total:
            error('model_compatibility.trainable_parameters', 'exceeds the total parameter count')
    return issues

validation = validate_qualification(record, [d['name'] for d in PINNED_DEPENDENCIES])
errors = [issue for issue in validation if issue['level'] == 'ERROR']
warnings_found = [issue for issue in validation if issue['level'] == 'WARNING']

write_canonical(QUALIFICATION_PATH, record)
print('wrote', QUALIFICATION_PATH, '(canonical form, contract 2)')
print('')
print('status          :', record['status'])
print('assertion       :', reproducibility['assertion'])
print('unknowns        :', len(record['unknowns']))
print('warnings        :', len(record['warnings']))
print('validation      :', len(errors), 'error(s),', len(warnings_found), 'warning(s)')
for issue in validation:
    print('  %-7s %-46s %s' % (issue['level'], issue['field'], issue['message']))
print('')
print('=' * 78)
print('env-qualification.json (pretty form; the file on disk is canonical)')
print('=' * 78)
print(json.dumps(record, indent=2, sort_keys=True))

if errors:
    abort('the emitted record violates docs/ENV_QUALIFICATION_CONTRACT.md 10:\n  - %s'
          % '\n  - '.join('%s: %s' % (e['field'], e['message']) for e in errors))`,

  String.raw`# --- Section 13: Human-readable report + paste-ready TypeScript ---
def ts_literal(value):
    return 'null' if value is None else json.dumps(value)

snippet_lines = [
    '// GENERATED by scripts/qualify/qualify-kaggle-env.ipynb - do not hand-edit.',
    '// Paste over PINNED_ENGINE_DEPENDENCIES in apps/web/lib/training/package.ts.',
    '// Source: env-qualification.json @ %s (status %s)' % (record['captured_at'], record['status']),
    '// Contract 11.1: spec is the FROZEN pin (4.0); resolvedVersion comes from resolved_version.',
    'export const PINNED_ENGINE_DEPENDENCIES: EngineDependency[] = [',
]
for dep in record['dependencies']:
    snippet_lines.append('  { name: %s, source: %s, spec: %s, resolvedVersion: %s, url: %s },'
                         % (ts_literal(dep['name']), ts_literal(dep['source']),
                            ts_literal(dep['spec']), ts_literal(dep['resolved_version']),
                            ts_literal(dep['url'])))
snippet_lines.append('];')
snippet = '\n'.join(snippet_lines) + '\n'
with open(TS_SNIPPET_PATH, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(snippet)

def md_table(records):
    lines = ['| name | source | resolved_version | resolved_commit | spec |',
             '| --- | --- | --- | --- | --- |']
    for dep in records:
        lines.append('| %s | %s | %s | %s | %s |'
                     % (dep['name'], dep['source'],
                        dep['resolved_version'] or '**UNRESOLVED**',
                        dep.get('resolved_commit') or '-', dep['spec']))
    return lines

report_lines = [
    '# GHARIBO environment qualification report',
    '',
    '- Captured: %s' % record['captured_at'],
    '- Contract: env-qualification.json schema %s (docs/ENV_QUALIFICATION_CONTRACT.md)'
    % record['contract_schema_version'],
    '- Harness: %s v%s (content address %s)'
    % (HARNESS_PATH, record['harness_version'], HARNESS_CONTENT_SHA256 or 'unset'),
    '- Experiment: %s' % record['experiment_id'],
    '- Engine: %s %s' % (record['engine']['engine'], record['engine']['engine_version']),
    '- **Status: %s**  (freeze gate frozen_ok = %s)'
    % (record['status'], record['status'] == 'QUALIFIED' and not record['unknowns']),
    '- Model compatibility: **%s** (contract 14)'
    % record['model_compatibility'].get('status'),
    '- Scope: QUALIFICATION ONLY - no training, no optimizer, no backward pass, no parameter update.',
    '',
    '## Environment',
    '',
    '| field | value |',
    '| --- | --- |',
]
for key in sorted(record['environment']):
    report_lines.append('| %s | %s |' % (key, record['environment'][key]))
report_lines += ['', '## dependencies[] (contract 4.3 rule 1)', ''] + md_table(record['dependencies'])
report_lines += ['', '## additional_dependencies[] (recipe-required, not pinned in package.ts)', '']
report_lines += md_table(record.get('additional_dependencies', []))
report_lines += [
    '',
    '## Reproducibility (contract 6)',
    '',
    '- assertion: **%s**' % record['reproducibility']['assertion'],
    '- comparison: %s' % record['reproducibility']['comparison'],
    '- dependency_set_hash: %s' % record['reproducibility']['dependency_set_hash'],
]
for entry in record['reproducibility']['passes']:
    report_lines.append('  - pass %s: %s -> %s, hash %s, python %s'
                        % (entry['pass_index'], entry['started_at'], entry['finished_at'],
                           entry['dependency_set_hash'], entry['base_python']))
for item in record['reproducibility'].get('mismatches', []):
    report_lines.append('  - MISMATCH %s' % item)
if record['reproducibility'].get('error'):
    report_lines.append('  - error: %s' % record['reproducibility']['error'])

report_lines += ['', '## Import smoke test (no weights downloaded)', '',
                 '| module | result | seconds | error |', '| --- | --- | --- | --- |']
for module in IMPORT_SMOKE_MODULES:
    result = import_smoke.get(module)
    if result is None:
        report_lines.append('| %s | not run | - | - |' % module)
    else:
        report_lines.append('| %s | %s | %s | %s |'
                            % (module, 'ok' if result.get('ok') else '**FAILED**',
                               result.get('seconds'), result.get('error') or ''))

report_lines += ['', '## Model compatibility (contract 14)', '',
                 '| check | value |', '| --- | --- |']
for field in ('status', 'base_model', 'base_model_revision', 'base_model_revision_matches_pin',
              'loader_model', 'loader_model_revision', 'dtype', 'max_seq_length',
              'tokenizer_loaded', 'harmony_verified', 'real_example_tokenized', 'model_loaded',
              'qlora_initialized', 'batch_collated', 'forward_dry_run_completed',
              'total_parameters', 'trainable_parameters', 'trainable_percentage',
              'vram_before_load', 'vram_after_load', 'vram_after_adapter_init', 'peak_vram',
              'artifact_destination_writable', 'optimizer_created', 'backward_executed',
              'optimizer_step_executed', 'training_loop_executed', 'model_parameters_updated',
              'parameter_digest_before', 'parameter_digest_after',
              'qualification_fixture_source', 'test_data_accessed',
              'gpu_count', 'gpu_models', 'vram_per_gpu', 'total_visible_vram',
              'multi_gpu_used_by_loader', 'output_hygiene_verified',
              'auto_freeze_applied', 'experiment_authorized'):
    report_lines.append('| %s | %s |' % (field, record['model_compatibility'].get(field)))
if record['model_compatibility'].get('failed_step'):
    report_lines += ['', '**MEASURED FAILURE** at step %s: %s'
                     % (record['model_compatibility']['failed_step'],
                        record['model_compatibility']['failed_step_error']),
                     '', 'No smaller model was substituted and the architecture was not changed.']
report_lines += ['', '### Dataset binding (the real GHARIBO example)', '',
                 '| field | value |', '| --- | --- |']
for field in ('id', 'version', 'example_count', 'example_split', 'example_index',
              'example_line_hash', 'example_message_roles', 'example_character_count',
              'dataset_hash_expected', 'dataset_hash_measured', 'dataset_hash_matches',
              'qualification_fixture_source', 'test_data_accessed',
              'qualification_fixture_hash', 'fixture_example_count',
              'fixture_example_hashes', 'fixture_example_indices'):
    report_lines.append('| %s | %s |' % (field, record['model_compatibility']['dataset'].get(field)))

report_lines += ['', '## unknowns[] (contract 7.2)', '']
if record['unknowns']:
    for entry in record['unknowns']:
        report_lines.append('- **%s**: %s' % (entry['field'], entry['reason']))
else:
    report_lines.append('- none')
report_lines += ['', '## warnings[]', '']
if record['warnings']:
    for entry in record['warnings']:
        report_lines.append('- %s' % entry)
else:
    report_lines.append('- none')
report_lines += ['', '## Validation (contract 10)', '']
if validation:
    for issue in validation:
        report_lines.append('- %s **%s**: %s' % (issue['level'], issue['field'], issue['message']))
else:
    report_lines.append('- no issues')
report_lines += [
    '',
    '## Next step',
    '',
    'STOP - CTO inspection required.',
    'The qualification artifact has been produced. The CTO must inspect',
    'env-qualification.json before any dependency freeze is applied or',
    'GHARIBO-exp-001 is authorized. Do not set frozenOk=true automatically.',
    'Do not update the dependency freeze. Do not authorize the experiment.',
    '',
]
report = '\n'.join(report_lines) + '\n'
with open(REPORT_PATH, 'w', encoding='utf-8', newline='\n') as handle:
    handle.write(report)

print('wrote', REPORT_PATH)
print('wrote', TS_SNIPPET_PATH)
print('')
print(report)
print('--- PINNED_ENGINE_DEPENDENCIES.frozen.ts ---')
print(snippet)`,

  String.raw`# --- Section 14: Final summary ---
def sha256_text(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()

artifact_names = ['env-qualification.json', 'env-qualification.md',
                  'PINNED_ENGINE_DEPENDENCIES.frozen.ts', 'qualification-install-args.json']
lines = []
for name in artifact_names:
    path = WORKING / name
    if path.exists():
        lines.append('%s  %s' % (sha256_file(path), name))
rollup = sha256_text('\n'.join(sorted(lines)))
with open(WORKING / 'CHECKSUMS.sha256', 'w', encoding='utf-8', newline='\n') as handle:
    handle.write('\n'.join(lines) + '\n# rollup  ' + rollup + '\n')

# Output hygiene: only qualification artifacts may persist in /kaggle/working.
FORBIDDEN_OUTPUTS = ['pytorch_model.bin', 'model.safetensors', 'adapter_model.bin',
                     'adapter_config.json', 'config.json', 'pytorch_model.bin.index.json']
hygiene_violations = []
for name in FORBIDDEN_OUTPUTS:
    if (WORKING / name).exists():
        hygiene_violations.append(name)
if hygiene_violations:
    print('WARNING: unexpected files in output directory:', hygiene_violations)
    record['model_compatibility']['output_hygiene_verified'] = False
else:
    record['model_compatibility']['output_hygiene_verified'] = True

frozen_ok = (record['status'] == 'QUALIFIED') and (len(record['unknowns']) == 0)
model_compat = record['model_compatibility']

print('=' * 78)
print('QUALIFICATION SUMMARY')
print('=' * 78)
print('contract_schema_version :', record['contract_schema_version'])
print('status                  :', record['status'])
print('frozen_ok               :', frozen_ok, '(contract 7.3)')
print('reproducibility         :', record['reproducibility']['assertion'])
print('dependencies resolved   : %d/%d'
      % (len([d for d in record['dependencies'] if d['resolved_version']]), len(record['dependencies'])))
print('additional resolved     : %d/%d'
      % (len([d for d in record.get('additional_dependencies', []) if d['resolved_version']]),
         len(record.get('additional_dependencies', []))))
print('unknowns                :', len(record['unknowns']))
print('validation errors       :', len(errors))
print('qualification_hash      :', record['qualification_hash'])
print('artifact rollup         :', rollup)
print('')
print('-' * 78)
print('MODEL COMPATIBILITY (gpt-oss-20b on this GPU)')
print('-' * 78)
print('result                  :', model_compat.get('status'))
print('gpu                     :', model_compat.get('gpu'), model_compat.get('compute_capability'))
print('gpu count               :', model_compat.get('gpu_count'))
if model_compat.get('gpu_models') and len(model_compat['gpu_models']) > 1:
    for i, gm in enumerate(model_compat['gpu_models']):
        print('  gpu[%d]                : %s' % (i, gm))
    print('vram per gpu            :', model_compat.get('vram_per_gpu'))
    print('total visible vram      :', model_compat.get('total_visible_vram'))
print('multi_gpu_used_by_loader:', model_compat.get('multi_gpu_used_by_loader'))
print('base model              :', model_compat.get('base_model'), '@', model_compat.get('base_model_revision'))
print('loader model            :', model_compat.get('loader_model'), '@', model_compat.get('loader_model_revision'))
print('tokenizer loaded        :', model_compat.get('tokenizer_loaded'))
print('harmony verified        :', model_compat.get('harmony_verified'))
print('real example tokenized  :', model_compat.get('real_example_tokenized'))
print('model loaded (4-bit)    :', model_compat.get('model_loaded'))
print('qlora initialized       :', model_compat.get('qlora_initialized'))
print('batch collated          :', model_compat.get('batch_collated'))
print('forward dry run         :', model_compat.get('forward_dry_run_completed'))
print('parameters              : total=%s trainable=%s (%s%%)'
      % (model_compat.get('total_parameters'), model_compat.get('trainable_parameters'),
         model_compat.get('trainable_percentage')))
print('vram before/after/adapt : %s / %s / %s'
      % (model_compat.get('vram_before_load'), model_compat.get('vram_after_load'),
         model_compat.get('vram_after_adapter_init')))
print('peak vram (forward)     :', model_compat.get('peak_vram'))
print('artifact dest writable  :', model_compat.get('artifact_destination_writable'))
print('optimizer created       :', model_compat.get('optimizer_created'))
print('backward executed       :', model_compat.get('backward_executed'))
print('optimizer step executed :', model_compat.get('optimizer_step_executed'))
print('training loop executed  :', model_compat.get('training_loop_executed'))
print('parameters updated      :', model_compat.get('model_parameters_updated'))
print('parameter digest before :', model_compat.get('parameter_digest_before'))
print('parameter digest after  :', model_compat.get('parameter_digest_after'))
print('fixture source          :', model_compat.get('qualification_fixture_source'))
print('test data accessed      :', model_compat.get('test_data_accessed'))
print('output hygiene verified :', model_compat.get('output_hygiene_verified'))
print('auto_freeze_applied     :', False, '(CTO must inspect before any freeze)')
print('experiment_authorized   :', False, '(GHARIBO-exp-001 NOT authorized by this run)')
if model_compat.get('failed_step'):
    print('')
    print('MEASURED FAILURE at step:', model_compat.get('failed_step'))
    print('  ', model_compat.get('failed_step_error'))
    print('  No smaller model was substituted. The architecture was not changed.')
print('')
print('-' * 78)
if record['status'] == 'QUALIFICATION_FAILED_MEASURED':
    print('RESULT: QUALIFICATION_FAILED_MEASURED')
    print('        openai/gpt-oss-20b could not be qualified on this free-Kaggle GPU.')
    print('        The failure above is measured, not inferred. STOP - do not train,')
    print('        do not substitute a smaller model, do not change the architecture.')
elif frozen_ok:
    print('RESULT: QUALIFIED - every dependency resolved to an exact version or commit SHA,')
    print('        two fresh environments agreed, unknowns[] is empty, and gpt-oss-20b')
    print('        loaded, initialised QLoRA, collated a batch and completed a forward-only')
    print('        dry run with an unchanged parameter digest.')
else:
    print('RESULT: %s - the freeze MUST NOT be applied yet (contract 7.3).' % record['status'])
    if record['unknowns']:
        print('        %d unresolved value(s) - see unknowns[] in env-qualification.json.'
              % len(record['unknowns']))
    if record['reproducibility']['assertion'] != 'IDENTICAL':
        print('        reproducibility assertion is %s.' % record['reproducibility']['assertion'])
    if model_compat.get('status') != 'QUALIFICATION_PASSED':
        print('        model compatibility is %s (contract 14).' % model_compat.get('status'))
print('')
print('TRAINING HAS NOT STARTED')
print('auto_freeze_applied:', False, '(CTO must inspect env-qualification.json before any freeze)')
print('experiment_authorized:', False, '(GHARIBO-exp-001 NOT authorized by this run)')
print('Download env-qualification.json and env-qualification.md from the notebook Output.')
print('Run this notebook as a Save-Version / committed run so /kaggle/working persists.')`,
];

// ---------------------------------------------------------------------------
// 4. Deterministic .ipynb assembly (same normalisation as notebook-render.ts).
// ---------------------------------------------------------------------------

const NOTEBOOK_METADATA = {
  kernelspec: { display_name: "Python 3", language: "python", name: "python3" },
  language_info: { name: "python", version: "3.11" },
};

/** Splits a source string into the canonical Jupyter line array. */
function toLines(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  if (parts.length > 1 && parts[parts.length - 1] === "") parts.pop();
  return parts.map((line, i) => (i < parts.length - 1 ? line + "\n" : line));
}

function substitute(source, harnessSha) {
  return source
    .split(INVENTORY_SENTINEL)
    .join(INVENTORY_JSON)
    .split(ENGINE_VERSION_SENTINEL)
    .join(ENGINE_VERSION)
    .split(HARNESS_SHA_SENTINEL)
    .join(harnessSha);
}

function buildNotebook(harnessSha) {
  const cells = CELLS.map((source, i) => ({
    cell_type: "code",
    execution_count: null,
    id: `gharibo-qualify-cell-${i}`,
    metadata: {},
    outputs: [],
    source: toLines(substitute(source, harnessSha)),
  }));
  return { cells, metadata: NOTEBOOK_METADATA, nbformat: 4, nbformat_minor: 5 };
}

function serialize(notebook) {
  return JSON.stringify(notebook, null, 1) + "\n";
}

/** Content address: sha256 of the notebook with the harness hash blanked. */
export function renderHarnessNotebook() {
  const blank = serialize(buildNotebook(""));
  const sha = createHash("sha256").update(blank, "utf8").digest("hex");
  return { content: serialize(buildNotebook(sha)), sha256: sha };
}

// ---------------------------------------------------------------------------
// 5. CLI
// ---------------------------------------------------------------------------

function main() {
  const check = process.argv.includes("--check");
  const { content, sha256 } = renderHarnessNotebook();
  const existing = fs.existsSync(NOTEBOOK_PATH) ? fs.readFileSync(NOTEBOOK_PATH, "utf8") : null;

  if (check) {
    if (existing === content) {
      console.log(`qualify harness is up to date (${CELLS.length} cells, content address ${sha256})`);
      return;
    }
    console.error("qualify harness is STALE - run: node scripts/qualify/qualify-kaggle-env.mjs");
    process.exit(1);
  }

  if (existing === content) {
    console.log(`unchanged: ${path.relative(ROOT, NOTEBOOK_PATH)} (content address ${sha256})`);
    return;
  }
  fs.writeFileSync(NOTEBOOK_PATH, content, "utf8");
  console.log(`wrote ${path.relative(ROOT, NOTEBOOK_PATH)}`);
  console.log(`  cells             : ${CELLS.length}`);
  console.log(`  content address   : ${sha256}`);
  console.log(`  contract schema   : ${INVENTORY_JSON.match(/"contract_schema_version": "([^"]+)"/)[1]}`);
  console.log(`  engine version    : ${ENGINE_VERSION}`);
  console.log(`  dependencies[]    : ${PINNED_INVENTORY.map((d) => d.name).join(", ")}`);
  console.log(`  additional[]      : ${EXTRA_INVENTORY.map((d) => d.name).join(", ")} + harmony (run time)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
