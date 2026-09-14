/**
 * Training Package export (architecture M2 §3.3).
 *
 * Assembles the bundle (manifest + dataset JSONL splits + notebook + checksums) and
 * the ZIP archive. GPU-free: generating a package never touches a GPU or a paid
 * service. Fails loudly on any package ERROR or a dataset hash mismatch.
 *
 * Server-only.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  BundleFile,
  DatasetRef,
  DatasetWithSplits,
  EnvironmentMetadata,
  SplitName,
  TrainingPackage,
  TrainingRun,
  TrainingWorkerId,
} from "@gharibo/shared";
import { HttpError } from "@gharibo/shared";
import {
  canonicalLine,
  datasetHashFromLines,
  toCanonicalInput,
} from "@/lib/training/canonical";
import { defaultSplitPolicy } from "@/lib/training/split";
import {
  DEFAULT_HARMONY,
  DEFAULT_EVALUATION_CONFIG,
  BASE_MODEL_IDENTITY,
  BASE_MODEL_REVISION,
  LOADER_MODEL_ID,
  UNSLOTH_ENGINE_VERSION,
  deriveBatch,
  deriveCheckpointPolicy,
  deriveEpochs,
  deriveLoRAFromRun,
  deriveSequenceLength,
  finalizePackage,
  pinnedEngineConfig,
  serializeManifest,
  parseManifest,
} from "@/lib/training/package";
import { formatIssues, hasBlockingErrors, validatePackage } from "@/lib/training/validate";
import { getTrainingWorker } from "@/lib/workers";
import type { BundleDatasetContents } from "@/lib/workers";
import { createZip } from "@/lib/training/zip";
import {
  dataFactoryRepository,
  datasetsRepository,
  experimentsRepository,
  trainingPackagesRepository,
  trainingRunsRepository,
} from "@/lib/db/repositories";
import type { TrainingPackageRow } from "@/lib/db/repositories/training-packages";

/** The result of assembling a bundle. */
export interface AssembleResult {
  pkg: TrainingPackage;
  manifest: string;
  files: BundleFile[];
  zip: Uint8Array;
}

/** Options for building a package for a run. */
export interface BuildPackageOptions {
  experimentId: string;
  runId: string;
  datasetId: string;
  workerId?: TrainingWorkerId;
}

/** The result of building a package for a run (includes persistence). */
export interface BuildPackageResult extends AssembleResult {
  packageRow: TrainingPackageRow;
  datasetVersionId: string;
}

/** Best-effort resolution of the real git commit SHA (never fabricated). */
export function resolveGitCommitSha(): string {
  const fromEnv =
    process.env.GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.NEXT_PUBLIC_GIT_COMMIT_SHA;
  if (fromEnv && /^[0-9a-f]{40}$/.test(fromEnv)) return fromEnv;

  const candidates = [
    path.join(process.cwd(), ".git"),
    path.join(process.cwd(), "..", "..", ".git"),
  ];
  for (const gitDir of candidates) {
    try {
      const headPath = path.join(gitDir, "HEAD");
      if (!fs.existsSync(headPath)) continue;
      const head = fs.readFileSync(headPath, "utf8").trim();
      if (head.startsWith("ref:")) {
        const ref = head.slice(4).trim();
        const refPath = path.join(gitDir, ref);
        if (fs.existsSync(refPath)) return fs.readFileSync(refPath, "utf8").trim();
        const packedPath = path.join(gitDir, "packed-refs");
        if (fs.existsSync(packedPath)) {
          const line = fs
            .readFileSync(packedPath, "utf8")
            .split("\n")
            .find((l) => l.endsWith(" " + ref));
          if (line) return line.split(" ")[0];
        }
      } else if (/^[0-9a-f]{40}$/.test(head)) {
        return head;
      }
    } catch {
      // best effort only
    }
  }
  return "unknown";
}

/** Loads records and their canonical lines for a record-id set. */
function loadCanonical(recordIds: string[]): {
  lineById: Map<string, string>;
  lines: string[];
} {
  const lineById = new Map<string, string>();
  const lines: string[] = [];
  for (const id of recordIds) {
    const record = dataFactoryRepository.get(id);
    if (!record) throw new HttpError(400, `Record not found: ${id}`);
    const line = canonicalLine(toCanonicalInput(record));
    lineById.set(id, line);
    lines.push(line);
  }
  return { lineById, lines };
}

/** Builds the per-split canonical JSONL contents for the bundle. */
function buildContents(
  splits: Record<SplitName, string[]>,
  lineById: Map<string, string>,
): BundleDatasetContents {
  const pick = (ids: string[]): string[] =>
    ids.map((id) => {
      const line = lineById.get(id);
      if (line === undefined) throw new HttpError(400, `Split references unknown record: ${id}`);
      return line;
    });
  return {
    train: pick(splits.train),
    validation: pick(splits.validation),
    test: pick(splits.test),
  };
}

/** The environment metadata is EMPTY until a real run executes (never fabricated). */
function emptyEnvironmentMetadata(): EnvironmentMetadata {
  return { os: "", pythonVersion: "", packages: {}, gpu: null, cuda: null };
}

/** Resolves (or cuts) the content-addressed dataset version to reference. */
function resolveDatasetVersion(
  datasetId: string,
  run: TrainingRun,
  recordIds: string[],
  computedHash: string,
): { version: DatasetWithSplits; splits: Record<SplitName, string[]> } {
  const dataset = datasetsRepository.get(datasetId);
  if (!dataset) throw new HttpError(404, "Dataset not found");

  const alreadyCut = dataset.status === "TRAINING_READY" && !!dataset.datasetHash;

  if (alreadyCut) {
    if (dataset.datasetHash !== computedHash) {
      throw new HttpError(
        400,
        "Dataset content has changed since it was cut (recomputed hash differs). Cut a new version.",
      );
    }
    const splits = datasetSplitsOrDefault(dataset.id);
    return { version: { ...dataset, splits }, splits };
  }

  // Cut a new content-addressed version (fails loudly on an undersized split / non-ready record).
  const policy = defaultSplitPolicy(run.seed ?? 3407);
  const cut = datasetsRepository.cutVersion({ name: dataset.name, recordIds, splitPolicy: policy });
  return { version: cut, splits: cut.splits };
}

/** Returns persisted split membership for a dataset version. */
function datasetSplitsOrDefault(datasetId: string): Record<SplitName, string[]> {
  return datasetsRepository.getSplits(datasetId);
}

/**
 * Builds, validates, persists, and bundles a Training Package for a run.
 * Throws HttpError(400) on any package ERROR (fails loudly).
 */
export function buildPackageForRun(opts: BuildPackageOptions): BuildPackageResult {
  const run = trainingRunsRepository.get(opts.runId);
  if (!run) throw new HttpError(404, "Training run not found");

  const dataset = datasetsRepository.get(opts.datasetId);
  if (!dataset) throw new HttpError(404, "Dataset not found");

  const recordIds = dataset.records.map((r) => r.recordId);
  if (recordIds.length === 0) throw new HttpError(400, "Dataset has no records");

  const { lineById, lines } = loadCanonical(recordIds);
  const computedHash = datasetHashFromLines(lines);

  // Determine the content-addressed dataset version + deterministic splits.
  const { version, splits } = resolveDatasetVersion(dataset.id, run, recordIds, computedHash);

  const splitCounts: Record<SplitName, number> = {
    train: splits.train.length,
    validation: splits.validation.length,
    test: splits.test.length,
  };

  // Derive engine values from the run's stored columns (never hardcoded).
  const lora = deriveLoRAFromRun(run);
  const epochs = deriveEpochs(run);

  const datasetRef: DatasetRef = {
    datasetId: version.id,
    datasetVersion: version.version,
    datasetVersionId: computedHash,
    datasetHash: computedHash,
    splitHashes: {
      train: version.splitHashes?.train ?? "",
      validation: version.splitHashes?.validation ?? "",
      test: version.splitHashes?.test ?? "",
    },
    splitPolicy: version.splitPolicy ?? defaultSplitPolicy(run.seed ?? 3407),
    recordCount: recordIds.length,
  };

  const draft = {
    schemaVersion: "1.0.0",
    experimentId: opts.experimentId,
    gitCommitSha: resolveGitCommitSha(),
    baseModel: BASE_MODEL_IDENTITY,
    baseModelRevision: run.baseModelRevision ?? BASE_MODEL_REVISION,
    loaderModelId: run.loaderModelId ?? LOADER_MODEL_ID,
    dataset: datasetRef,
    engine: { ...pinnedEngineConfig(), engineVersion: UNSLOTH_ENGINE_VERSION },
    quantization: "4-bit" as const,
    lora: lora ?? { r: 0, alpha: 0, targetModules: [], dropout: 0, bias: "none" as const },
    method: "QLoRA + SFT" as const,
    sequenceLength: deriveSequenceLength(run),
    batch: deriveBatch(run),
    optimizer: run.optimizer ?? "adamw_8bit",
    learningRate: run.learningRate ?? 0.0002,
    epochs: epochs.epochs,
    maxSteps: epochs.maxSteps,
    warmupSteps: run.warmupSteps ?? 5,
    lrSchedulerType: run.lrSchedulerType ?? "linear",
    weightDecay: run.weightDecay ?? 0.01,
    dtype: "fp16" as const,
    seed: run.seed ?? 3407,
    checkpointPolicy: deriveCheckpointPolicy(run),
    artifactDestination: null,
    evaluationConfig: DEFAULT_EVALUATION_CONFIG,
    environmentMetadata: emptyEnvironmentMetadata(),
    harmony: DEFAULT_HARMONY,
    createdAt: new Date().toISOString(),
  };

  const pkg = finalizePackage(draft);

  // Validate with the real split counts + dataset status (fail loudly).
  const issues = validatePackage(pkg, {
    datasetStatus: version.status ?? "DRAFT",
    splitCounts,
  });
  if (hasBlockingErrors(issues)) {
    throw new HttpError(400, `Training Package validation failed: ${formatIssues(issues)}`);
  }

  const manifest = serializeManifest(pkg);
  const worker = getTrainingWorker(opts.workerId ?? "kaggle");
  const contents = buildContents(splits, lineById);
  const files = worker.buildBundle(pkg, contents);
  const zip = createZip(files.map((f) => ({ path: f.relativePath, content: f.content })));
  const notebook = worker.renderNotebook(pkg);

  // Persist the immutable package + link it to the run/experiment.
  const packageRow = trainingPackagesRepository.create({
    manifest,
    experimentId: pkg.experimentId,
    datasetId: version.id,
    datasetVersionId: computedHash,
    runId: run.runId,
    notebookSha256: notebook.sha256,
    bundlePath: null,
    workerId: worker.id,
  });
  trainingRunsRepository.setPackage(run.runId, packageRow.id);
  linkExperiment(run.runId, packageRow.id, pkg);

  return { pkg, manifest, files, zip, packageRow, datasetVersionId: computedHash };
}

/** Links the package to the experiment row for this run, when one exists. */
function linkExperiment(runId: string, packageId: string, pkg: TrainingPackage): void {
  const experiment = experimentsRepository
    .list()
    .find((e) => e.trainingRunId === runId || e.id === pkg.experimentId);
  if (experiment) {
    experimentsRepository.setPackage(experiment.id, packageId);
    experimentsRepository.setProvenance(experiment.id, buildProvenance(pkg));
  }
}

/** Builds the provenance record stored on the experiment (§5.4). */
export function buildProvenance(pkg: TrainingPackage): Record<string, unknown> {
  return {
    package_id: pkg.packageId,
    experiment_id: pkg.experimentId,
    git_commit_sha: pkg.gitCommitSha,
    base_model: pkg.baseModel,
    base_model_revision: pkg.baseModelRevision,
    loader_model_id: pkg.loaderModelId,
    dataset_hash: pkg.dataset.datasetHash,
    split_hashes: pkg.dataset.splitHashes,
    engine_version: pkg.engine.engineVersion,
    dependencies: pkg.engine.dependencies,
    environment_metadata: pkg.environmentMetadata,
    artifact_rollup_hash: null,
  };
}

/**
 * Re-assembles the bundle for an already-issued package (used by the export route).
 * Fails loudly if the dataset version is not TRAINING_READY or its hash no longer
 * matches the manifest.
 */
export function assembleBundleForPackage(row: TrainingPackageRow): AssembleResult {
  const pkg = parseManifest(row.manifest);
  const dataset = datasetsRepository.get(pkg.dataset.datasetId);
  if (!dataset) throw new HttpError(404, "Dataset version not found for this package");
  if (dataset.status !== "TRAINING_READY") {
    throw new HttpError(400, "Dataset version is not TRAINING_READY");
  }

  const recordIds = dataset.records.map((r) => r.recordId);
  const { lineById, lines } = loadCanonical(recordIds);
  const computedHash = datasetHashFromLines(lines);
  if (computedHash !== pkg.dataset.datasetHash) {
    throw new HttpError(400, "Dataset hash mismatch: the dataset changed since the package was issued");
  }

  const splits = datasetsRepository.getSplits(dataset.id);
  const worker = getTrainingWorker((row.workerId as TrainingWorkerId) ?? "kaggle");
  const files = worker.buildBundle(pkg, buildContents(splits, lineById));
  const zip = createZip(files.map((f) => ({ path: f.relativePath, content: f.content })));
  return { pkg, manifest: row.manifest, files, zip };
}
