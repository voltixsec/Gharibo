/**
 * Canonical Training Package — build, serialize, content-address (architecture M2 §3).
 *
 * - `packageId` = sha256(canonical manifest with `package_id=""`) — a content address,
 *   not a UUID. Packages are immutable; any change issues a NEW package.
 * - The wire manifest is snake_case (PRD §6.1 verbatim); this module owns the mapping.
 * - Engine values are DERIVED from stored `training_runs` columns (§6.2), never hardcoded.
 *
 * Server-only (uses node:crypto via ./hash).
 */
import type {
  ArtifactDestination,
  CheckpointPolicy,
  EngineConfig,
  EngineDependency,
  EvaluationConfig,
  HarmonyMapping,
  LoRAConfig,
  TrainingPackage,
  TrainingRun,
} from "@gharibo/shared";
import {
  HARMONY_HIDDEN_CHANNELS,
  TRAINING_PACKAGE_SCHEMA_VERSION,
} from "@gharibo/shared";
import { canonicalJson, sha256Canonical } from "./hash";

// ---------------------------------------------------------------------------
// Model identity (verified — m2-stack-facts.md §3.1). Both are public/ungated.
// ---------------------------------------------------------------------------

/** Identity / lineage base model. */
export const BASE_MODEL_IDENTITY = "openai/gpt-oss-20b";
/** Pinned revision of the identity base model (verified against the HF API). */
export const BASE_MODEL_REVISION = "6cee5e81ee83917806bbde320786a8fb61efebee";
/** The 4-bit / MXFP4 representation actually loaded for QLoRA. */
export const LOADER_MODEL_ID = "unsloth/gpt-oss-20b";

// ---------------------------------------------------------------------------
// Engine pin (m2-stack-facts.md §4). resolvedVersion stays null until a real
// install resolves it — the notebook verifies the spec and records the actual
// version into the manifest at run time. Nothing here is fabricated.
// ---------------------------------------------------------------------------

/** The M2 dependency-freeze label (a date-based pin). */
export const UNSLOTH_ENGINE_VERSION = "unsloth-freeze-2026.09.15";

/** The exact pinned Unsloth install set (m2-stack-facts.md §4). */
export const PINNED_ENGINE_DEPENDENCIES: EngineDependency[] = [
  { name: "torch", source: "pip", spec: "torch>=2.8.0", resolvedVersion: null, url: null },
  { name: "triton", source: "pip", spec: "triton>=3.4.0", resolvedVersion: null, url: null },
  { name: "unsloth_zoo", source: "pip", spec: "unsloth_zoo==2026.9.3", resolvedVersion: "2026.9.3", url: null },
  { name: "unsloth", source: "pip", spec: "unsloth==2026.9.4", resolvedVersion: "2026.9.4", url: null },
  { name: "transformers", source: "pip", spec: "transformers==4.56.2", resolvedVersion: "4.56.2", url: null },
  { name: "triton_kernels", source: "git", spec: "@05b2c186c1b6c9a08375389d5efe9cb4c401c075#subdirectory=python/triton_kernels", resolvedVersion: null, url: "https://github.com/triton-lang/triton.git" },
  { name: "peft", source: "pip", spec: "peft==0.20.0", resolvedVersion: "0.20.0", url: null },
  { name: "trl", source: "pip", spec: "trl==0.22.2", resolvedVersion: "0.22.2", url: null },
  { name: "datasets", source: "pip", spec: "datasets==5.0.1", resolvedVersion: "5.0.1", url: null },
  { name: "accelerate", source: "pip", spec: "accelerate==1.15.0", resolvedVersion: "1.15.0", url: null },
  { name: "bitsandbytes", source: "pip", spec: "bitsandbytes==0.50.2", resolvedVersion: "0.50.2", url: null },
  { name: "openai-harmony", source: "pip", spec: "openai-harmony==0.0.8", resolvedVersion: "0.0.8", url: null },
];

/** Builds a fresh copy of the pinned engine config. */
export function pinnedEngineConfig(): EngineConfig {
  return {
    engine: "unsloth",
    engineVersion: UNSLOTH_ENGINE_VERSION,
    dependencies: PINNED_ENGINE_DEPENDENCIES.map((d) => ({ ...d })),
  };
}

// ---------------------------------------------------------------------------
// Policy defaults (Q2/Q3/O1). Non-derivable values only; engine values that map
// to stored columns are always taken from the run.
// ---------------------------------------------------------------------------

export const DEFAULT_SEQUENCE_LENGTH = 1024;
export const MIN_SEQUENCE_LENGTH = 512;
export const VALID_SEQUENCE_LENGTHS: readonly number[] = [512, 1024];
export const DEFAULT_OPTIMIZER = "adamw_8bit";
export const DEFAULT_WARMUP_STEPS = 5;
export const DEFAULT_LR_SCHEDULER = "linear";
export const DEFAULT_WEIGHT_DECAY = 0.01;
export const DEFAULT_SAVE_STEPS = 50;
export const DEFAULT_SAVE_TOTAL_LIMIT = 2;
export const DEFAULT_DTYPE = "fp16";
export const DEFAULT_BATCH_SIZE = 1;
export const DEFAULT_GRAD_ACCUM = 4;
export const DEFAULT_LORA_DROPOUT = 0;
export const DEFAULT_LORA_BIAS = "none";
export const DEFAULT_MAX_STEPS = 30;

/** The default (domain-agnostic) Harmony mapping. */
export const DEFAULT_HARMONY: HarmonyMapping = {
  developerTemplateId: "research-structured-knowledge",
  reasoningEffort: "medium",
  hiddenChannels: ["analysis"],
};

/** Declared evaluation intent — never executed in M2 (no fabricated results). */
export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  executed: false,
  status: "NOT_RUN",
  benchmarkCategories: [
    "Reasoning",
    "Instruction Following",
    "Structured Output",
    "Research",
    "Source Fidelity",
    "Hallucination Resistance",
  ],
  researchMetrics: [
    "schema_correctness",
    "record_precision",
    "duplicate_rate",
    "unsupported_claim_rate",
    "source_coverage",
    "taxonomy_accuracy",
  ],
};

// ---------------------------------------------------------------------------
// Derivation from stored `training_runs` columns (§6.2) — never hardcoded.
// ---------------------------------------------------------------------------

/**
 * Derives the LoRA config from the run's stored columns.
 * Returns null when `lora_rank`/`lora_alpha` are null or `target_modules` is empty
 * (validation rule 7 — non-derivable LoRA values are an ERROR).
 */
export function deriveLoRAFromRun(run: TrainingRun): LoRAConfig | null {
  const r = run.loraRank ?? null;
  const alpha = run.loraAlpha ?? null;
  const modules = run.targetModules ?? [];
  if (r === null || alpha === null || modules.length === 0) return null;
  return {
    r,
    alpha,
    targetModules: [...modules],
    dropout: DEFAULT_LORA_DROPOUT,
    bias: DEFAULT_LORA_BIAS,
  };
}

/** Derives the sequence length (max_seq_length) from the run, with a conservative default. */
export function deriveSequenceLength(run: TrainingRun): number {
  return run.maxSeqLength ?? DEFAULT_SEQUENCE_LENGTH;
}

/** Derives the batch config from the run's stored columns. */
export function deriveBatch(run: TrainingRun): {
  perDeviceTrainBatchSize: number;
  gradientAccumulationSteps: number;
} {
  return {
    perDeviceTrainBatchSize: run.batchSize ?? DEFAULT_BATCH_SIZE,
    gradientAccumulationSteps: run.gradientAccumulation ?? DEFAULT_GRAD_ACCUM,
  };
}

/** Derives the checkpoint policy from the run's stored columns (resume requires steps). */
export function deriveCheckpointPolicy(run: TrainingRun): CheckpointPolicy {
  return {
    saveStrategy: "steps",
    saveSteps: run.saveSteps ?? DEFAULT_SAVE_STEPS,
    saveTotalLimit: run.saveTotalLimit ?? DEFAULT_SAVE_TOTAL_LIMIT,
    resumeFromCheckpoint: run.resumeFromCheckpoint ?? null,
  };
}

/** Derives `epochs`/`max_steps` such that exactly one is non-null. */
export function deriveEpochs(run: TrainingRun): { epochs: number | null; maxSteps: number | null } {
  if (run.epochs !== null && run.epochs !== undefined) {
    return { epochs: run.epochs, maxSteps: null };
  }
  return { epochs: null, maxSteps: DEFAULT_MAX_STEPS };
}

// ---------------------------------------------------------------------------
// Manifest (snake_case wire format) — serializer owns the mapping.
// ---------------------------------------------------------------------------

/** Serializes a package to its snake_case wire manifest object. */
export function toManifest(pkg: TrainingPackage): Record<string, unknown> {
  return {
    schema_version: pkg.schemaVersion,
    package_id: pkg.packageId,
    experiment_id: pkg.experimentId,
    git_commit_sha: pkg.gitCommitSha,
    ...(pkg.preview ? { preview: {
      status: pkg.preview.status,
      qualification_hash: pkg.preview.qualificationHash,
      recipe_hash: pkg.preview.recipeHash,
      source_files_hash: pkg.preview.sourceFilesHash,
      working_tree_dirty: pkg.preview.workingTreeDirty,
      training_authorized: pkg.preview.trainingAuthorized,
      training_has_started: pkg.preview.trainingHasStarted,
      test_usage: pkg.preview.testUsage,
    } } : {}),
    base_model: pkg.baseModel,
    base_model_revision: pkg.baseModelRevision,
    loader_model_id: pkg.loaderModelId,
    dataset: {
      dataset_id: pkg.dataset.datasetId,
      ...(pkg.schemaVersion === "1.0.0"
        ? {}
        : { record_format: pkg.dataset.recordFormat }),
      dataset_version: pkg.dataset.datasetVersion,
      dataset_version_id: pkg.dataset.datasetVersionId,
      dataset_hash: pkg.dataset.datasetHash,
      split_hashes: {
        train: pkg.dataset.splitHashes.train,
        validation: pkg.dataset.splitHashes.validation,
        test: pkg.dataset.splitHashes.test,
      },
      split_policy: {
        algorithm: pkg.dataset.splitPolicy.algorithm,
        seed: pkg.dataset.splitPolicy.seed,
        ratios: {
          train: pkg.dataset.splitPolicy.ratios.train,
          validation: pkg.dataset.splitPolicy.ratios.validation,
          test: pkg.dataset.splitPolicy.ratios.test,
        },
        minimum_records_per_split: pkg.dataset.splitPolicy.minimumRecordsPerSplit,
        ...(pkg.dataset.splitPolicy.algorithm === "seeded-sha256-content-hash-with-audit-quarantine" ? {
          method: pkg.dataset.splitPolicy.method,
          line_hash_algorithm: pkg.dataset.splitPolicy.lineHashAlgorithm,
          split_hash_algorithm: pkg.dataset.splitPolicy.splitHashAlgorithm,
          audit_quarantine: {
            audit_seed: pkg.dataset.splitPolicy.auditQuarantine.auditSeed,
            audit_cohort_size: pkg.dataset.splitPolicy.auditQuarantine.auditCohortSize,
            quarantined_into: [...pkg.dataset.splitPolicy.auditQuarantine.quarantinedInto],
            test_audited: pkg.dataset.splitPolicy.auditQuarantine.testAudited,
          },
          test_held_out: pkg.dataset.splitPolicy.testHeldOut,
          test_policy: pkg.dataset.splitPolicy.testPolicy,
        } : {}),
      },
      record_count: pkg.dataset.recordCount,
    },
    engine: {
      engine: pkg.engine.engine,
      engine_version: pkg.engine.engineVersion,
      dependencies: pkg.engine.dependencies.map((d) => ({
        name: d.name,
        source: d.source,
        spec: d.spec,
        resolved_version: d.resolvedVersion,
        url: d.url,
      })),
    },
    quantization: pkg.quantization,
    lora: {
      r: pkg.lora.r,
      alpha: pkg.lora.alpha,
      target_modules: [...pkg.lora.targetModules],
      dropout: pkg.lora.dropout,
      bias: pkg.lora.bias,
    },
    method: pkg.method,
    sequence_length: pkg.sequenceLength,
    batch: {
      per_device_train_batch_size: pkg.batch.perDeviceTrainBatchSize,
      gradient_accumulation_steps: pkg.batch.gradientAccumulationSteps,
    },
    optimizer: pkg.optimizer,
    learning_rate: pkg.learningRate,
    epochs: pkg.epochs,
    max_steps: pkg.maxSteps,
    warmup_steps: pkg.warmupSteps,
    lr_scheduler_type: pkg.lrSchedulerType,
    weight_decay: pkg.weightDecay,
    dtype: pkg.dtype,
    seed: pkg.seed,
    checkpoint_policy: {
      save_strategy: pkg.checkpointPolicy.saveStrategy,
      save_steps: pkg.checkpointPolicy.saveSteps,
      save_total_limit: pkg.checkpointPolicy.saveTotalLimit,
      resume_from_checkpoint: pkg.checkpointPolicy.resumeFromCheckpoint,
    },
    artifact_destination: pkg.artifactDestination
      ? {
          kind: pkg.artifactDestination.kind,
          repo_id: pkg.artifactDestination.repoId,
          private: pkg.artifactDestination.private,
          path: pkg.artifactDestination.path,
          token_secret_name: pkg.artifactDestination.tokenSecretName,
        }
      : null,
    evaluation_config: {
      executed: pkg.evaluationConfig.executed,
      status: pkg.evaluationConfig.status,
      benchmark_categories: [...pkg.evaluationConfig.benchmarkCategories],
      research_metrics: [...pkg.evaluationConfig.researchMetrics],
    },
    environment_metadata: {
      os: pkg.environmentMetadata.os,
      python_version: pkg.environmentMetadata.pythonVersion,
      packages: { ...pkg.environmentMetadata.packages },
      gpu: pkg.environmentMetadata.gpu,
      cuda: pkg.environmentMetadata.cuda,
    },
    harmony: {
      developer_template_id: pkg.harmony.developerTemplateId,
      reasoning_effort: pkg.harmony.reasoningEffort,
      hidden_channels: [...pkg.harmony.hiddenChannels],
    },
    created_at: pkg.createdAt,
  };
}

/** sha256 of the canonical manifest with `package_id=""` — the content address. */
export function computePackageId(pkg: TrainingPackage): string {
  const manifest = toManifest(pkg);
  manifest.package_id = "";
  return sha256Canonical(manifest);
}

/** Recomputes the package id from a stored manifest JSON string. */
export function computePackageIdFromManifest(manifestJson: string): string {
  const obj = JSON.parse(manifestJson) as Record<string, unknown>;
  obj.package_id = "";
  return sha256Canonical(obj);
}

/** Assigns the content-address `packageId` to a draft package. */
export function finalizePackage(
  draft: Omit<TrainingPackage, "packageId"> | TrainingPackage,
): TrainingPackage {
  const candidate = { ...draft, packageId: "" } as TrainingPackage;
  return { ...candidate, packageId: computePackageId(candidate) };
}

/** Serializes a finalized package to its canonical (sorted-key) manifest JSON. */
export function serializeManifest(pkg: TrainingPackage): string {
  return canonicalJson(toManifest(pkg));
}

/** Parses a snake_case manifest JSON string back into the camelCase package type. */
export function parseManifest(manifestJson: string): TrainingPackage {
  const m = JSON.parse(manifestJson) as any;
  return {
    schemaVersion: m.schema_version,
    packageId: m.package_id,
    experimentId: m.experiment_id,
    gitCommitSha: m.git_commit_sha,
    ...(m.preview ? { preview: {
      status: m.preview.status,
      qualificationHash: m.preview.qualification_hash,
      recipeHash: m.preview.recipe_hash,
      sourceFilesHash: m.preview.source_files_hash,
      workingTreeDirty: m.preview.working_tree_dirty,
      trainingAuthorized: m.preview.training_authorized,
      trainingHasStarted: m.preview.training_has_started,
      testUsage: m.preview.test_usage,
    } } : {}),
    baseModel: m.base_model,
    baseModelRevision: m.base_model_revision,
    loaderModelId: m.loader_model_id,
    dataset: {
      datasetId: m.dataset.dataset_id,
      recordFormat:
        m.dataset.record_format ?? (m.schema_version === "1.0.0" ? "canonical-record-v1" : undefined),
      datasetVersion: m.dataset.dataset_version,
      datasetVersionId: m.dataset.dataset_version_id,
      datasetHash: m.dataset.dataset_hash,
      splitHashes: {
        train: m.dataset.split_hashes.train,
        validation: m.dataset.split_hashes.validation,
        test: m.dataset.split_hashes.test,
      },
      splitPolicy: {
        algorithm: m.dataset.split_policy.algorithm,
        seed: m.dataset.split_policy.seed,
        ratios: {
          train: m.dataset.split_policy.ratios.train,
          validation: m.dataset.split_policy.ratios.validation,
          test: m.dataset.split_policy.ratios.test,
        },
        minimumRecordsPerSplit: m.dataset.split_policy.minimum_records_per_split,
        ...(m.dataset.split_policy.algorithm === "seeded-sha256-content-hash-with-audit-quarantine" ? {
          method: m.dataset.split_policy.method,
          lineHashAlgorithm: m.dataset.split_policy.line_hash_algorithm,
          splitHashAlgorithm: m.dataset.split_policy.split_hash_algorithm,
          auditQuarantine: {
            auditSeed: m.dataset.split_policy.audit_quarantine?.audit_seed,
            auditCohortSize: m.dataset.split_policy.audit_quarantine?.audit_cohort_size,
            quarantinedInto: m.dataset.split_policy.audit_quarantine?.quarantined_into ?? [],
            testAudited: m.dataset.split_policy.audit_quarantine?.test_audited,
          },
          testHeldOut: m.dataset.split_policy.test_held_out,
          testPolicy: m.dataset.split_policy.test_policy,
        } : {}),
      },
      recordCount: m.dataset.record_count,
    },
    engine: {
      engine: m.engine.engine,
      engineVersion: m.engine.engine_version,
      dependencies: (m.engine.dependencies as any[]).map((d) => ({
        name: d.name,
        source: d.source,
        spec: d.spec,
        resolvedVersion: d.resolved_version ?? null,
        url: d.url ?? null,
      })),
    },
    quantization: m.quantization,
    lora: {
      r: m.lora.r,
      alpha: m.lora.alpha,
      targetModules: [...m.lora.target_modules],
      dropout: m.lora.dropout,
      bias: m.lora.bias,
    },
    method: m.method,
    sequenceLength: m.sequence_length,
    batch: {
      perDeviceTrainBatchSize: m.batch.per_device_train_batch_size,
      gradientAccumulationSteps: m.batch.gradient_accumulation_steps,
    },
    optimizer: m.optimizer,
    learningRate: m.learning_rate,
    epochs: m.epochs ?? null,
    maxSteps: m.max_steps ?? null,
    warmupSteps: m.warmup_steps,
    lrSchedulerType: m.lr_scheduler_type,
    weightDecay: m.weight_decay,
    dtype: m.dtype,
    seed: m.seed,
    checkpointPolicy: {
      saveStrategy: m.checkpoint_policy.save_strategy,
      saveSteps: m.checkpoint_policy.save_steps,
      saveTotalLimit: m.checkpoint_policy.save_total_limit,
      resumeFromCheckpoint: m.checkpoint_policy.resume_from_checkpoint ?? null,
    },
    artifactDestination: m.artifact_destination
      ? ({
          kind: m.artifact_destination.kind,
          repoId: m.artifact_destination.repo_id ?? null,
          private: m.artifact_destination.private === true,
          path: m.artifact_destination.path ?? null,
          tokenSecretName: m.artifact_destination.token_secret_name ?? null,
        } as ArtifactDestination)
      : null,
    evaluationConfig: {
      // Preserve the raw runtime values so validatePackage can catch tampering
      // (the TS literal types are enforced by the writer, not the reader).
      executed: (m.evaluation_config.executed === true) as false,
      status: m.evaluation_config.status,
      benchmarkCategories: [...m.evaluation_config.benchmark_categories],
      researchMetrics: [...m.evaluation_config.research_metrics],
    },
    environmentMetadata: {
      os: m.environment_metadata.os,
      pythonVersion: m.environment_metadata.python_version,
      packages: { ...m.environment_metadata.packages },
      gpu: m.environment_metadata.gpu ?? null,
      cuda: m.environment_metadata.cuda ?? null,
    },
    harmony: {
      developerTemplateId: m.harmony.developer_template_id,
      reasoningEffort: m.harmony.reasoning_effort,
      hiddenChannels: [...m.harmony.hidden_channels] as ["analysis"],
    },
    createdAt: m.created_at,
  };
}

/** True iff `pkg`'s packageId matches the recomputed content address. */
export function isPackageIdValid(pkg: TrainingPackage): boolean {
  return pkg.packageId === computePackageId(pkg);
}

/** True iff `hiddenChannels` matches the mandatory hidden-channel set. */
export function hasHiddenAnalysisChannel(pkg: TrainingPackage): boolean {
  return HARMONY_HIDDEN_CHANNELS.every((c) => pkg.harmony.hiddenChannels.includes(c as "analysis"));
}

/** Re-exports for convenience. */
export { TRAINING_PACKAGE_SCHEMA_VERSION };
