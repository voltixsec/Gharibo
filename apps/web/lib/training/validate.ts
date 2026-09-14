/**
 * Package validation (architecture M2 §3.5).
 *
 * `validatePackage(pkg, ctx?)` returns `ValidationIssue[]`. ANY `ERROR` blocks export
 * (HTTP 400) and blocks the notebook's pre-training gate.
 *
 * Two rules need data that is deliberately NOT carried in the package (a package is
 * content-free: it carries hashes, not records). The export path supplies them via
 * `ctx` (split counts + the dataset version status); when `ctx` is absent those rules
 * are skipped and are enforced by the export path instead.
 */
import type { DatasetVersionStatus, SplitName, TrainingPackage } from "@gharibo/shared";
import { isGitSha, isSha256Hex } from "./hash";
import { computePackageId } from "./package";

/** Severity of a validation issue. */
export type ValidationLevel = "ERROR" | "WARN";

/** A single validation issue. */
export interface ValidationIssue {
  level: ValidationLevel;
  field: string;
  message: string;
}

/** Extra, export-time context for rules that need the underlying data. */
export interface PackageValidationContext {
  /** Dataset version lifecycle status (rule 6). */
  datasetStatus?: DatasetVersionStatus;
  /** Per-split record counts (rule 5). */
  splitCounts?: Record<SplitName, number>;
}

/** The schema major this reader supports. */
export const SUPPORTED_SCHEMA_MAJOR = "1";

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

function isNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

/** Validates a package. Any ERROR blocks export. */
export function validatePackage(
  pkg: TrainingPackage,
  ctx: PackageValidationContext = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (field: string, message: string): void => {
    issues.push({ level: "ERROR", field, message });
  };
  const warn = (field: string, message: string): void => {
    issues.push({ level: "WARN", field, message });
  };

  // --- Rule 1: required fields present/non-empty ---
  const requiredStrings: Array<[string, unknown]> = [
    ["schema_version", pkg.schemaVersion],
    ["package_id", pkg.packageId],
    ["experiment_id", pkg.experimentId],
    ["git_commit_sha", pkg.gitCommitSha],
    ["base_model", pkg.baseModel],
    ["base_model_revision", pkg.baseModelRevision],
    ["loader_model_id", pkg.loaderModelId],
    ["created_at", pkg.createdAt],
    ["dataset.dataset_id", pkg.dataset.datasetId],
    ["dataset.dataset_version", pkg.dataset.datasetVersion],
    ["dataset.dataset_version_id", pkg.dataset.datasetVersionId],
    ["dataset.dataset_hash", pkg.dataset.datasetHash],
    ["engine.engine_version", pkg.engine.engineVersion],
    ["optimizer", pkg.optimizer],
    ["lr_scheduler_type", pkg.lrSchedulerType],
    ["harmony.developer_template_id", pkg.harmony.developerTemplateId],
  ];
  for (const [field, value] of requiredStrings) {
    if (!isNonEmptyString(value)) err(field, `Required field "${field}" is missing or empty`);
  }
  if (pkg.quantization !== "4-bit") err("quantization", 'quantization must be "4-bit"');
  if (pkg.method !== "QLoRA + SFT") err("method", 'method must be "QLoRA + SFT"');
  if (!isNumber(pkg.seed)) err("seed", "seed must be a number");
  if (!isNumber(pkg.learningRate)) err("learning_rate", "learning_rate must be a number");
  if (!isNumber(pkg.warmupSteps)) err("warmup_steps", "warmup_steps must be a number");
  if (!isNumber(pkg.weightDecay)) err("weight_decay", "weight_decay must be a number");
  if (!isNumber(pkg.batch?.perDeviceTrainBatchSize) || pkg.batch.perDeviceTrainBatchSize < 1) {
    err("batch.per_device_train_batch_size", "per_device_train_batch_size must be >= 1");
  }
  if (!isNumber(pkg.batch?.gradientAccumulationSteps) || pkg.batch.gradientAccumulationSteps < 1) {
    err("batch.gradient_accumulation_steps", "gradient_accumulation_steps must be >= 1");
  }

  // --- Rule 2: schema major supported ---
  if (isNonEmptyString(pkg.schemaVersion)) {
    const major = pkg.schemaVersion.split(".")[0];
    if (major !== SUPPORTED_SCHEMA_MAJOR) {
      err("schema_version", `Unsupported schema major "${major}" (supported: ${SUPPORTED_SCHEMA_MAJOR})`);
    }
  }

  // --- Rule 3: git_commit_sha is 40-hex or "unknown" ---
  if (isNonEmptyString(pkg.gitCommitSha) && pkg.gitCommitSha !== "unknown" && !isGitSha(pkg.gitCommitSha)) {
    err("git_commit_sha", 'git_commit_sha must be 40-hex or "unknown"');
  }

  // --- Rule 4: dataset hash + split hashes are 64-hex ---
  if (!isSha256Hex(pkg.dataset.datasetHash)) err("dataset.dataset_hash", "dataset_hash must be 64-hex sha256");
  for (const name of ["train", "validation", "test"] as const) {
    if (!isSha256Hex(pkg.dataset.splitHashes?.[name])) {
      err(`dataset.split_hashes.${name}`, `split_hashes.${name} must be 64-hex sha256`);
    }
  }

  // --- Rule 5: no split below minimum_records_per_split (needs ctx) ---
  if (ctx.splitCounts) {
    const min = pkg.dataset.splitPolicy.minimumRecordsPerSplit;
    for (const name of ["train", "validation", "test"] as const) {
      const count = ctx.splitCounts[name];
      if (!isNumber(count) || count < min) {
        err(
          `split_policy.${name}`,
          `Split "${name}" has ${count ?? "?"} record(s), below minimum_records_per_split=${min}`,
        );
      }
    }
  }

  // --- Rule 6: dataset version is TRAINING_READY (needs ctx) ---
  if (ctx.datasetStatus !== undefined && ctx.datasetStatus !== "TRAINING_READY") {
    err("dataset.status", `Dataset version is not TRAINING_READY (status: ${ctx.datasetStatus})`);
  }

  // --- Rule 7: LoRA values derivable from stored columns ---
  if (!isNumber(pkg.lora?.r) || pkg.lora.r <= 0) err("lora.r", "lora.r is not derivable (must be > 0)");
  if (!isNumber(pkg.lora?.alpha) || pkg.lora.alpha <= 0) {
    err("lora.alpha", "lora.alpha is not derivable (must be > 0)");
  }
  if (!Array.isArray(pkg.lora?.targetModules) || pkg.lora.targetModules.length === 0) {
    err("lora.target_modules", "lora.target_modules is not derivable (must be non-empty)");
  }

  // --- Rule 8: dtype is fp16 (T4 = Turing; bf16 unsupported) ---
  if (pkg.dtype !== "fp16") err("dtype", 'dtype must be "fp16"');

  // --- Rule 9: sequence_length ∈ {512, 1024} ---
  if (pkg.sequenceLength !== 512 && pkg.sequenceLength !== 1024) {
    err("sequence_length", "sequence_length must be 512 or 1024");
  }

  // --- Rule 10: exactly one of epochs / max_steps is non-null ---
  const hasEpochs = pkg.epochs !== null && pkg.epochs !== undefined;
  const hasMaxSteps = pkg.maxSteps !== null && pkg.maxSteps !== undefined;
  if (hasEpochs === hasMaxSteps) {
    err("epochs", "Exactly one of epochs / max_steps must be non-null");
  }

  // --- Rule 11: engine dependencies non-empty ---
  if (!Array.isArray(pkg.engine?.dependencies) || pkg.engine.dependencies.length === 0) {
    err("engine.dependencies", "engine.dependencies must be non-empty (exact pinned set)");
  }

  // --- Rule 12: an HF destination must be private with a repo id ---
  if (pkg.artifactDestination && pkg.artifactDestination.kind === "hf") {
    if (!isNonEmptyString(pkg.artifactDestination.repoId)) {
      err("artifact_destination.repo_id", 'artifact_destination.kind="hf" requires repo_id');
    }
    if (pkg.artifactDestination.private !== true) {
      err("artifact_destination.private", 'artifact_destination.kind="hf" must be private');
    }
  }

  // --- Rule 13: no fabricated evaluation results ---
  if (pkg.evaluationConfig?.executed !== false || pkg.evaluationConfig?.status !== "NOT_RUN") {
    err("evaluation_config", 'evaluation_config must be executed=false / status="NOT_RUN"');
  }

  // --- Rule 14: resume requires step checkpoints ---
  if (pkg.checkpointPolicy?.saveStrategy !== "steps") {
    err("checkpoint_policy.save_strategy", 'save_strategy must be "steps" (resume requires step checkpoints)');
  }

  // --- Rule 15: package_id equals the recomputed content address ---
  if (isNonEmptyString(pkg.packageId)) {
    const recomputed = computePackageId(pkg);
    if (pkg.packageId !== recomputed) {
      err("package_id", "package_id does not match the recomputed canonical manifest hash");
    }
  }

  // Non-blocking advisory: hidden analysis channel must be declared.
  if (!Array.isArray(pkg.harmony?.hiddenChannels) || !pkg.harmony.hiddenChannels.includes("analysis")) {
    warn("harmony.hidden_channels", 'harmony.hidden_channels should include "analysis"');
  }

  return issues;
}

/** True iff the issues contain at least one ERROR. */
export function hasBlockingErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.level === "ERROR");
}

/** Formats issues into a single human-readable string. */
export function formatIssues(issues: ValidationIssue[]): string {
  return issues.map((i) => `[${i.level}] ${i.field}: ${i.message}`).join("; ");
}
