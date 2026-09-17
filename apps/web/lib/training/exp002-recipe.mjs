/**
 * GHARIBO EXP-002 governed training recipe.
 *
 * Single source of truth for the EXP-002 experiment definition. Imported by the
 * preflight builder, the training-package builder, and the tests, so the recipe
 * cannot drift between the artifact that is authorized and the artifact that runs.
 *
 * Every value here is either measured (see `data/derived/exp002/`) or pinned to
 * an immutable identity. Nothing is a convenience default.
 */
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Experiment id. Immutable. */
export const EXP002_ID = "GHARIBO-exp-002";

/** Identity base model (lineage). */
export const BASE_MODEL_ID = "openai/gpt-oss-20b";

/**
 * Pinned revision of the identity base model. This is the revision the governed
 * tokenizer snapshot was taken from, so the measured token geometry and the
 * trained representation are guaranteed to come from the same tokenizer.
 */
export const BASE_MODEL_REVISION = "6cee5e81ee83917806bbde320786a8fb61efebee";

/** The 4-bit representation actually loaded for QLoRA. */
export const LOADER_MODEL_ID = "unsloth/gpt-oss-20b";

/**
 * Pinned revision of the loader repository.
 *
 * EXP-001 loaded the loader by branch, so its tokenizer template could change
 * between the measured contract and the executed run. The revision is pinned
 * here, and the governed chat template is asserted by hash independently of it.
 */
export const LOADER_MODEL_REVISION = "e220476dc09936adfed96d0451acfa3601c23bd7";

// ---------------------------------------------------------------------------
// Governed representation
// ---------------------------------------------------------------------------

/**
 * sha256 of `apps/web/lib/workers/kaggle/governed-chat-template.jinja`.
 *
 * This is the identity model's own `chat_template.jinja`. The loader repository
 * ships a patched template whose only behavioural difference for this dataset is
 * that it terminates the final assistant message with `<|end|>` instead of
 * `<|return|>`. `<|return|>` is the unambiguous end-of-final-message marker, so
 * the identity template is the one that makes the final-channel contract
 * deterministic.
 */
export const GOVERNED_CHAT_TEMPLATE_SHA256 =
  "a4c9919cbbd4acdd51ccffe22da049264b1b73e59055fa58811a99efbd7c8146";

export const GOVERNED_CHAT_TEMPLATE_PATH =
  "apps/web/lib/workers/kaggle/governed-chat-template.jinja";

/** Reasoning effort written into the template's system header. */
export const GOVERNED_REASONING_EFFORT = "medium";

/**
 * Pinned value for the template's `strftime_now`. The template injects a
 * "Current date:" line into the system header; leaving it dynamic would make the
 * rendered representation differ between the training day and the inference day.
 */
export const GOVERNED_SYSTEM_DATE = "2026-09-15";

/** The governed conversation shape, as the frozen Gold dataset declares it. */
export const GOVERNED_ROLE_SEQUENCE = "system -> user -> assistant";

/** The Harmony channel the supervised answer must occupy. */
export const GOVERNED_FINAL_CHANNEL = "final";

/** The governed end-of-final-message marker. */
export const GOVERNED_TERMINATOR = "<|return|>";

/** Label value substituted for every position that must not contribute to loss. */
export const IGNORE_INDEX = -100;

/** The explicit, non-default supervision contract. */
export const LOSS_CONTRACT = {
  kind: "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
  description:
    "Every token position outside the proven assistant span is set to -100 before " +
    "collation; the collator pads labels with -100 and never rebuilds labels from " +
    "input_ids. No trainer default is relied upon.",
  reliesOnTrainerDefault: false,
  assistantOnlyLossFlag: false,
  assistantOnlyLossFlagReason:
    "TRL's assistant_only_loss requires {% generation %} markers in the chat template. " +
    "The governed gpt-oss template does not carry them, so the flag is not usable and an " +
    "explicit mask is implemented instead.",
  collator: "AssistantOnlyCollator",
  failClosedOnZeroSupervisedRow: true,
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/**
 * The governed EXP-002 split. Defined by `scripts/exp002/cut_exp002_split.py`
 * with seed 20260917 over the 720 rows of Gold v0.1 TRAIN+VALIDATION.
 */
export const EXP002_SPLIT = {
  seed: "20260917",
  manifestPath: "data/derived/exp002/splits/split-manifest.json",
  train: {
    name: "train",
    path: "data/derived/exp002/splits/train.jsonl",
    rows: 560,
    splitHash: "94da02d6cc7a99146a1bfc3084d5a99f1ab96e262a6c48f025c92cd79de53cf8",
  },
  dev: {
    name: "dev",
    path: "data/derived/exp002/splits/dev.jsonl",
    rows: 80,
    splitHash: "77b8040e8a85d310a6e4ad1a81a013ad9b1b6c3775cc929202a9830f1e0d49ec",
  },
  qualification: {
    name: "qualification",
    path: "data/derived/exp002/splits/qualification.jsonl",
    rows: 80,
    splitHash: "1c5648cbcaa292357017abb8bc9a6775205f4a6f2abde688079ff7ed0aa9a9b1",
    /** Never read before the V1 promotion gate. Only its hash may travel. */
    readPolicy: "SEALED_UNTIL_V1_PROMOTION_GATE",
  },
  /**
   * The governed PILOT payload: the deterministic prefix of the train ordering.
   * Non-promotable; used for end-to-end pipeline validation only.
   */
  pilot: {
    name: "pilot",
    path: "data/derived/exp002/splits/pilot-100.jsonl",
    rows: 100,
    splitHash: "b8250d987dc50cfbceb1a4cf3b69dd9cbe1b03ae6ab073d3beb36d103d81f023",
    fileSha256: "0de7275c492f4e3234ee808ba127c41e4bb094a37c4f1e7bf8ba4a5856126151",
    manifestPath: "data/derived/exp002/splits/pilot-manifest.json",
    definition: "deterministic prefix of the governed EXP-002 train ordering",
    promotable: false,
  },
  consumedTest: {
    dataset: "GHARIBO-Research-Gold-v0.1",
    split: "test",
    rows: 80,
    splitHash: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
    consumedBy: "Evaluation Attempt #6 (DEC-0046/DEC-0047/DEC-0048)",
    reusableAsPromotionEvidence: false,
  },
};

// ---------------------------------------------------------------------------
// Effective window
// ---------------------------------------------------------------------------

/**
 * Measured maximum rendered length across TRAIN (2689) and DEV (2493) tokens.
 * 3072 is the smallest candidate context that contains every assistant span with
 * zero truncation, and is also the smallest power-of-two above the measured max.
 */
export const MEASURED_MAX_RENDERED_TOKENS = 2689;
export const SEQUENCE_LENGTH = 3072;

/** Evidence source for the context decision. */
export const TOKEN_WINDOW_ARTIFACT = "data/derived/exp002/token-window-exp002.json";
export const MASKING_CONTRACT_ARTIFACT = "data/derived/exp002/masking-contract.json";

// ---------------------------------------------------------------------------
// Hyperparameters (simplest defensible configuration; no sweep)
// ---------------------------------------------------------------------------

export const HYPERPARAMETERS = {
  method: "QLoRA + SFT",
  quantization: "4-bit",
  epochs: 1,
  maxSteps: null,
  perDeviceTrainBatchSize: 1,
  gradientAccumulationSteps: 4,
  learningRate: 2e-4,
  warmupSteps: 5,
  lrSchedulerType: "linear",
  weightDecay: 0.01,
  optimizer: "adamw_8bit",
  seed: 20260917,
  lora: { r: 16, alpha: 16, dropout: 0, bias: "none" },
  /**
   * Declared honestly. EXP-001 declared fp16 and the engine overrode it to
   * float32 (`Using float16 precision for gpt_oss won't work! Using float32`).
   * EXP-002 budgets for float32 and does not claim to be an fp16 run.
   */
  dtype: "float32",
  dtypeNote:
    "The Unsloth gpt-oss path on Turing refuses fp16 and trains in float32. Declared " +
    "float32 rather than inheriting a declared fp16 that the engine overrides.",
  packing: false,
  gradientCheckpointing: "unsloth",
};

/**
 * Checkpoint policy, declared BEFORE the run so no checkpoint can be chosen
 * opportunistically after seeing qualification performance.
 */
export const CHECKPOINT_POLICY = {
  saveStrategy: "steps",
  saveSteps: 140,
  saveTotalLimit: 2,
  resumeFromCheckpoint: null,
  /**
   * The only checkpoint eligible for qualification is the terminal one. Because
   * the run is a single epoch with a declared step budget, `checkpoint-140` IS
   * the final step; no earlier checkpoint is a candidate.
   */
  selectionRule: "TERMINAL_CHECKPOINT_ONLY",
  selectionRuleDetail:
    "One epoch at 560 examples / (batch 1 x grad-accum 4) = 140 optimizer steps. " +
    "The terminal checkpoint is the only candidate. No checkpoint may be selected " +
    "using qualification-set performance.",
};

// ---------------------------------------------------------------------------
// Expected runtime
// ---------------------------------------------------------------------------

export const EXPECTED_RUNTIME = {
  worker: "KaggleTrainingWorker",
  provider: "Kaggle Notebooks free tier",
  accelerator: "NVIDIA T4 (Turing, sm_75)",
  acceleratorCount: 1,
  vramGbMinimum: 14.0,
  precision: "float32 (engine-imposed for gpt-oss on Turing)",
  bf16Supported: false,
  flashAttention2: false,
  multiGpuRequired: false,
  estimatedOptimizerSteps: 140,
  sessionLimitHours: 12,
  weeklyGpuQuotaHours: 30,
  persistence: "/kaggle/working only (<= 20 GB)",
  kaggleSecretsOnly: true,
};

// ---------------------------------------------------------------------------
// Execution modes
// ---------------------------------------------------------------------------

/**
 * The two governed EXP-002 execution modes.
 *
 * PILOT runs first and exists only to validate the pipeline end to end. It is
 * non-promotable and carries no V1 claim. PRODUCTION is the governed contract.
 * Both use the SAME representation, loss contract, context length and template:
 * only the row count, the checkpoint cadence and the projected runtime differ.
 */
export function exp002Mode(mode) {
  if (mode === "pilot") {
    return {
      mode: "pilot",
      experimentId: "GHARIBO-exp-002-pilot",
      rows: EXP002_SPLIT.pilot.rows,
      splitPath: EXP002_SPLIT.pilot.path,
      splitHash: EXP002_SPLIT.pilot.splitHash,
      devRows: 0,
      promotable: false,
      purpose: "End-to-end pipeline validation only. No V1 claim.",
      checkpointPolicy: {
        ...CHECKPOINT_POLICY,
        saveSteps: EXP002_SPLIT.pilot.rows / HYPERPARAMETERS.gradientAccumulationSteps,
        saveTotalLimit: 1,
      },
      projectedHours: 0.61,
    };
  }
  if (mode === "production") {
    return {
      mode: "production",
      experimentId: EXP002_ID,
      rows: EXP002_SPLIT.train.rows,
      splitPath: EXP002_SPLIT.train.path,
      splitHash: EXP002_SPLIT.train.splitHash,
      devRows: EXP002_SPLIT.dev.rows,
      promotable: false,
      purpose: "Governed production training contract.",
      checkpointPolicy: CHECKPOINT_POLICY,
      projectedHours: 3.07,
    };
  }
  throw new Error(`unknown EXP-002 execution mode: ${mode}`);
}

// ---------------------------------------------------------------------------
// Engine freeze
// ---------------------------------------------------------------------------

/**
 * The governed frozen dependency set, recovered verbatim from
 * `governance/DEC-0025-authorized-preview.json` -> `engine.dependencies`.
 *
 * THIS LIST MUST NOT BE EMPTY. Pilot Kaggle Version 2 failed in SETUP because
 * the package builder emitted `dependencies: []`, so the notebook's install plan
 * resolved to a `uv pip install` invocation with no package argument at all and
 * `uv` exited 2:
 *
 *   error: the following required arguments were not provided:
 *     <PACKAGE|--requirements|--editable|--group>
 *
 * No training occurred. The pre-push gates now assert the install plan is
 * non-empty so an empty engine set cannot reach Kaggle again.
 */
export const ENGINE_FREEZE = {
  engine: "unsloth",
  engineVersion: "unsloth-freeze-2026.09.15",
  dependencies: [
    { name: "torch", source: "pip", spec: "torch>=2.8.0", resolvedVersion: null, url: null },
    { name: "triton", source: "pip", spec: "triton>=3.4.0", resolvedVersion: null, url: null },
    { name: "unsloth_zoo", source: "pip", spec: "unsloth_zoo==2026.9.3", resolvedVersion: "2026.9.3", url: null },
    { name: "unsloth", source: "pip", spec: "unsloth==2026.9.4", resolvedVersion: "2026.9.4", url: null },
    { name: "transformers", source: "pip", spec: "transformers==4.56.2", resolvedVersion: "4.56.2", url: null },
    {
      name: "triton_kernels",
      source: "git",
      spec: "@05b2c186c1b6c9a08375389d5efe9cb4c401c075#subdirectory=python/triton_kernels",
      resolvedVersion: null,
      url: "https://github.com/triton-lang/triton.git",
    },
    { name: "peft", source: "pip", spec: "peft==0.20.0", resolvedVersion: "0.20.0", url: null },
    { name: "trl", source: "pip", spec: "trl==0.22.2", resolvedVersion: "0.22.2", url: null },
    { name: "datasets", source: "pip", spec: "datasets==5.0.1", resolvedVersion: "5.0.1", url: null },
    { name: "accelerate", source: "pip", spec: "accelerate==1.15.0", resolvedVersion: "1.15.0", url: null },
    { name: "bitsandbytes", source: "pip", spec: "bitsandbytes==0.50.2", resolvedVersion: "0.50.2", url: null },
    { name: "openai-harmony", source: "pip", spec: "openai-harmony==0.0.8", resolvedVersion: "0.0.8", url: null },
  ],
};

// ---------------------------------------------------------------------------
// Recipe hash
// ---------------------------------------------------------------------------

/** Deterministic JSON with sorted keys, so the hash is stable. */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

/** The immutable recipe the hash covers. */
export function recipeDefinition() {
  return {
    experimentId: EXP002_ID,
    baseModel: BASE_MODEL_ID,
    baseModelRevision: BASE_MODEL_REVISION,
    loaderModelId: LOADER_MODEL_ID,
    loaderModelRevision: LOADER_MODEL_REVISION,
    governedChatTemplateSha256: GOVERNED_CHAT_TEMPLATE_SHA256,
    governedReasoningEffort: GOVERNED_REASONING_EFFORT,
    governedSystemDate: GOVERNED_SYSTEM_DATE,
    roleSequence: GOVERNED_ROLE_SEQUENCE,
    finalChannel: GOVERNED_FINAL_CHANNEL,
    terminator: GOVERNED_TERMINATOR,
    ignoreIndex: IGNORE_INDEX,
    lossContract: LOSS_CONTRACT,
    splits: {
      train: { rows: EXP002_SPLIT.train.rows, splitHash: EXP002_SPLIT.train.splitHash },
      dev: { rows: EXP002_SPLIT.dev.rows, splitHash: EXP002_SPLIT.dev.splitHash },
      qualification: {
        rows: EXP002_SPLIT.qualification.rows,
        splitHash: EXP002_SPLIT.qualification.splitHash,
      },
      splitSeed: EXP002_SPLIT.seed,
    },
    sequenceLength: SEQUENCE_LENGTH,
    hyperparameters: HYPERPARAMETERS,
    checkpointPolicy: CHECKPOINT_POLICY,
    expectedRuntime: EXPECTED_RUNTIME,
  };
}

/** sha256 of the canonical recipe definition — the immutable recipe hash. */
export function recipeHash() {
  return createHash("sha256").update(canonicalJson(recipeDefinition()), "utf8").digest("hex");
}

/**
 * The PILOT recipe definition.
 *
 * Derived from the production definition with ONLY the execution-mode fields
 * overridden, so the two hashes provably differ in the row count, the payload
 * hash, the checkpoint cadence and the promotability flag — and nowhere else.
 * The representation, template, loss contract and context length are inherited
 * unchanged, which is what makes the pilot a valid rehearsal of production.
 */
export function pilotRecipeDefinition() {
  const base = recipeDefinition();
  const pilot = exp002Mode("pilot");
  return {
    ...base,
    mode: "pilot",
    experimentId: pilot.experimentId,
    promotable: false,
    purpose: pilot.purpose,
    splits: {
      train: { rows: pilot.rows, splitHash: pilot.splitHash },
      dev: { rows: 0, splitHash: null },
      qualification: base.splits.qualification,
      splitSeed: base.splits.splitSeed,
    },
    checkpointPolicy: pilot.checkpointPolicy,
  };
}

/** sha256 of the canonical PILOT recipe definition. */
export function pilotRecipeHash() {
  return createHash("sha256").update(canonicalJson(pilotRecipeDefinition()), "utf8").digest("hex");
}

export { canonicalJson };
