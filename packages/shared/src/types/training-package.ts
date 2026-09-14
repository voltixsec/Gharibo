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
export const TRAINING_PACKAGE_SCHEMA_VERSION = "1.0.0";

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

/** The dataset version the package trains on (content-addressed). */
export interface DatasetRef {
  datasetId: string;
  /** Human version label, e.g. "v1". */
  datasetVersion: string;
  /** Content-addressed id = datasetHash. */
  datasetVersionId: string;
  datasetHash: string;
  splitHashes: SplitHashes;
  splitPolicy: SplitPolicy;
  recordCount: number;
}

/** The canonical, immutable, self-describing Training Package (camelCase). */
export interface TrainingPackage {
  /** "1.0.0" */
  schemaVersion: string;
  /** sha256 of the canonical manifest — content address. */
  packageId: string;
  /** e.g. "GHARIBO-exp-001"; immutable. */
  experimentId: string;
  gitCommitSha: string;
  /** "openai/gpt-oss-20b" (identity / lineage). */
  baseModel: string;
  /** Pinned revision of the base model. */
  baseModelRevision: string;
  /** "unsloth/gpt-oss-20b" (the 4-bit representation actually loaded). */
  loaderModelId: string;
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
  dtype: "fp16";
  seed: number;
  checkpointPolicy: CheckpointPolicy;
  /** null = local fallback. */
  artifactDestination: ArtifactDestination | null;
  evaluationConfig: EvaluationConfig;
  environmentMetadata: EnvironmentMetadata;
  harmony: HarmonyMapping;
  createdAt: string;
}
