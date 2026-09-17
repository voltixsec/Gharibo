/**
 * Canonical Training Package contract (architecture M2 §3).
 * @gharibo/shared
 *
 * The TS type is camelCase; the wire manifest (`manifest.json`) is snake_case,
 * verbatim from PRD §6.1. The serializer (`apps/web/lib/training/package.ts`) owns
 * the mapping. A package is immutable once issued; any change yields a NEW package
 * with a new `packageId` = sha256(canonical manifest with `package_id=""`).
 */
import type { BenchmarkCategory, ResearchMetric } from "./evaluation";
import type { SplitHashes, SplitPolicy } from "./dataset";

/** The package contract version this reader/writer supports. */
export const TRAINING_PACKAGE_SCHEMA_VERSION = "1.1.0";

/**
 * Harmony channels that must NEVER be shown to end users. `analysis` is
 * chain-of-thought (reduced safety). Any future serving path (P2-03) must render
 * only `final`.
 */
export const HARMONY_HIDDEN_CHANNELS: readonly string[] = ["analysis"];

/** Harmony roles (OpenAI Harmony response format). */
export type HarmonyRole = "system" | "developer" | "user" | "assistant" | "tool";

/** Harmony assistant channels. */
export type HarmonyChannel = "final" | "analysis" | "commentary";

/** A single Harmony message produced by the record → Harmony mapping. */
export interface HarmonyMessage {
  role: HarmonyRole;
  /** Present for assistant messages only. */
  channel?: HarmonyChannel;
  content: string;
}

/** The mapping rules carried in the package (domain-agnostic). */
export interface HarmonyMapping {
  /** Domain-agnostic framing template id (the actual text is CTO-owned). */
  developerTemplateId: string;
  reasoningEffort: "low" | "medium" | "high";
  /** Channels never shown to end users; machine-readable. */
  hiddenChannels: ["analysis"];
}

/**
 * Removes any hidden-channel segment from a rendered Harmony string.
 * A segment runs from `<|start|>` to the next `<|start|>` (or end of string);
 * segments whose channel is hidden are dropped.
 */
export function stripHiddenChannels(
  rendered: string,
  hidden: readonly string[] = HARMONY_HIDDEN_CHANNELS,
): string {
  if (!rendered) return rendered;
  const parts = rendered.split("<|start|>");
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i === 0) {
      if (part.length > 0) kept.push(part);
      continue;
    }
    const channelMatch = part.match(/<\|channel\|>([A-Za-z0-9_]+)<\|message\|>/);
    if (channelMatch && hidden.includes(channelMatch[1])) continue;
    kept.push("<|start|>" + part);
  }
  return kept.join("");
}

/** A pinned engine dependency (exact reproducibility set). */
export interface EngineDependency {
  name: string;
  source: "pip" | "git";
  /** Exact pinned spec recorded at freeze. */
  spec: string;
  /** Exact resolved version, verified by the notebook (null until resolved). */
  resolvedVersion: string | null;
  /** Git URL where applicable. */
  url: string | null;
}

/** The training engine + its pinned dependency set. */
export interface EngineConfig {
  engine: "unsloth";
  engineVersion: string;
  dependencies: EngineDependency[];
}

/** LoRA configuration, derived from stored `training_runs` columns (never hardcoded). */
export interface LoRAConfig {
  /** ← training_runs.lora_rank */
  r: number;
  /** ← training_runs.lora_alpha */
  alpha: number;
  /** ← training_runs.target_modules */
  targetModules: string[];
  dropout: number;
  bias: "none" | "all" | "lora_only";
}

/** Checkpoint + resume policy (resume requires step checkpoints). */
export interface CheckpointPolicy {
  saveStrategy: "steps";
  saveSteps: number;
  saveTotalLimit: number;
  resumeFromCheckpoint: string | null;
}

/** Optional artifact destination. `null` = local export/download fallback. */
export interface ArtifactDestination {
  kind: "hf" | "local";
  /** Required for `hf`. */
  repoId: string | null;
  /** Must be true for `hf` (free-tier private repo only). */
  private: boolean;
  /** Local export path for `local`. */
  path: string | null;
  /** Kaggle Secret NAME only — never the token value. */
  tokenSecretName: string | null;
}

/** Declared evaluation intent. No metrics are ever fabricated. */
export interface EvaluationConfig {
  executed: false;
  status: "NOT_RUN";
  benchmarkCategories: BenchmarkCategory[];
  researchMetrics: ResearchMetric[];
}

/** Environment metadata; empty until a real run executes. */
export interface EnvironmentMetadata {
  os: string;
  pythonVersion: string;
  packages: Record<string, string>;
  gpu: string | null;
  cuda: string | null;
}

/**
 * Physical JSONL representation carried by the package.
 *
 * canonical-record-v1:
 *   canonical Data Factory record JSONL.
 *
 * harmony-messages-v1:
 *   governed Gold JSONL with a top-level messages[] array.
 *   The physical JSONL lines remain the content identity.
 */
export type DatasetRecordFormat =
  | "canonical-record-v1"
  | "harmony-messages-v1";

/** Physical Gold policy; absence of a declared minimum is not a zero/default. */
export interface GovernedGoldPackageSplitPolicy {
  algorithm: "seeded-sha256-content-hash-with-audit-quarantine";
  seed: number;
  ratios: { train: number; validation: number; test: number };
  minimumRecordsPerSplit: number | null;
  method: string | null;
  lineHashAlgorithm: string | null;
  splitHashAlgorithm: string | null;
  auditQuarantine: {
    auditSeed: number | null;
    auditCohortSize: number | null;
    quarantinedInto: Array<"train" | "validation">;
    testAudited: number | null;
  };
  testHeldOut: true;
  testPolicy: string;
}

/** A preview is never an issued package or permission to execute. */
export interface PackagePreviewProvenance {
  status: "PREVIEW";
  qualificationHash: string;
  recipeHash: string;
  sourceFilesHash: string;
  workingTreeDirty: boolean;
  trainingAuthorized: false;
  trainingHasStarted: false;
  testUsage: "HASH_INTEGRITY_ONLY";
}

/**
 * The governed EXP-002 contract block.
 *
 * ADDITIVE and OPTIONAL. Every 1.1.0 manifest that does not carry it stays valid
 * and byte-stable, so historical packages (GHARIBO-exp-001) are untouched. When
 * it IS present, the training notebook treats it as mandatory and asserts every
 * value: the governed chat template hash, the pinned system date, the role
 * sequence, the explicit assistant-only label mask, the sealed qualification
 * split and the consumed-TEST exclusion.
 *
 * It lives inside the package because the package is the content-addressed
 * contract: the recipe hash must be covered by `packageId`.
 */
export interface Exp002GovernedContract {
  /** sha256 of the canonical EXP-002 recipe definition. */
  recipeHash: string;
  /** sha256 of the governed chat template (the identity model's own template). */
  governedChatTemplateSha256: string;
  /** Reasoning effort written into the template's system header. */
  governedReasoningEffort: string;
  /** Pinned `strftime_now` value, removing template date nondeterminism. */
  governedSystemDate: string;
  /** The governed conversation shape, e.g. "system -> user -> assistant". */
  roleSequence: string;
  /** The Harmony channel the supervised answer occupies. */
  finalChannel: string;
  /** The governed end-of-final-message marker. */
  terminator: string;
  /** Label value substituted for every non-supervised position. */
  ignoreIndex: number;
  /**
   * The dtype the governed recipe declares. The package-level `dtype` and the
   * notebook's runtime assertion must both equal this. Pilot Version 1 failed
   * pre-training because they did not.
   */
  declaredDtype: "fp16" | "bf16" | "float32";
  lossContract: {
    kind: "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK";
    reliesOnTrainerDefault: false;
    collator: string;
    failClosedOnZeroSupervisedRow: true;
  };
  splits: {
    train: Exp002SplitRef;
    dev: Exp002SplitRef;
    /** Sealed: never read before the V1 promotion gate. */
    qualification: Exp002SplitRef;
    splitSeed: string;
  };
  consumedTest: {
    splitHash: string;
    /** Always false. Attempt #6 consumed this split. */
    reusableAsPromotionEvidence: false;
  };
  contextPolicy: {
    chosenContextLength: number;
    measuredMaxRenderedTokens: number;
    rule: string;
  };
  /** Always true: the qualification payload never travels. */
  qualificationSealed: true;
}

/** One governed EXP-002 split reference. */
export interface Exp002SplitRef {
  file: string;
  rows: number;
  splitHash: string;
  /** Present on the sealed qualification split only. */
  readPolicy?: "SEALED_UNTIL_V1_PROMOTION_GATE";
}

/** The dataset version the package trains on (content-addressed). */
export interface DatasetRef {
  datasetId: string;
  /** Physical JSONL representation; part of package identity. */
  recordFormat: DatasetRecordFormat;
  /** Human version label, e.g. "v1". */
  datasetVersion: string;
  /** Content-addressed id = datasetHash. */
  datasetVersionId: string;
  datasetHash: string;
  splitHashes: SplitHashes;
  splitPolicy: SplitPolicy | GovernedGoldPackageSplitPolicy;
  recordCount: number;
}

/** The canonical, immutable, self-describing Training Package (camelCase). */
export interface TrainingPackage {
  /** Current writer emits TRAINING_PACKAGE_SCHEMA_VERSION. */
  schemaVersion: string;
  /** sha256 of the canonical manifest — content address. */
  packageId: string;
  /** e.g. "GHARIBO-exp-001"; immutable. */
  experimentId: string;
  gitCommitSha: string;
  preview?: PackagePreviewProvenance;
  /**
   * The governed EXP-002 contract. Optional and additive: absent for historical
   * packages, mandatory for any run that declares it.
   */
  exp002?: Exp002GovernedContract;
  /** "openai/gpt-oss-20b" (identity / lineage). */
  baseModel: string;
  /** Pinned revision of the base model. */
  baseModelRevision: string;
  /** "unsloth/gpt-oss-20b" (the 4-bit representation actually loaded). */
  loaderModelId: string;
  /**
   * Pinned revision of the loader repository. Optional and additive.
   *
   * The loader repository ships a PATCHED chat template, so an unpinned loader is
   * a mutable dependency on the trained representation. EXP-002 pins it.
   */
  loaderModelRevision?: string;
  dataset: DatasetRef;
  engine: EngineConfig;
  quantization: "4-bit";
  lora: LoRAConfig;
  method: "QLoRA + SFT";
  /** max_seq_length; 1024 default, auto-downgrade to 512 if VRAM < 15 GB. */
  sequenceLength: number;
  batch: { perDeviceTrainBatchSize: number; gradientAccumulationSteps: number };
  optimizer: string;
  learningRate: number;
  epochs: number | null;
  maxSteps: number | null;
  warmupSteps: number;
  lrSchedulerType: string;
  weightDecay: number;
  /**
   * The dtype the run DECLARES.
   *
   * This must be the dtype the engine actually uses, not the one that looks
   * conventional for the hardware. GHARIBO-exp-001 declared `fp16` and Unsloth
   * overrode it at runtime ("Using float16 precision for gpt_oss won't work!
   * Using float32"), producing an F32 adapter under an fp16 declaration — a
   * MATERIAL_RUNTIME_DEVIATION recorded in DEC-0030.
   *
   * GHARIBO-exp-002-pilot Kaggle Version 1 failed pre-training because the
   * package said `fp16` while the notebook asserted `float32`. The declaration
   * and the assertion are now required to agree.
   */
  dtype: "fp16" | "bf16" | "float32";
  seed: number;
  checkpointPolicy: CheckpointPolicy;
  /** null = local fallback. */
  artifactDestination: ArtifactDestination | null;
  evaluationConfig: EvaluationConfig;
  environmentMetadata: EnvironmentMetadata;
  harmony: HarmonyMapping;
  createdAt: string;
}
