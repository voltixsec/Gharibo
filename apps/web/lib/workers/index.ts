/**
 * Provider-neutral TrainingWorker abstraction (architecture M2 §2.1).
 *
 * Mirrors the M1 `ModelProvider` abstraction (ADR-0003) in shape: a small interface,
 * a runtime factory, and one implementation per worker. Every method is PURE — a
 * total function from a TrainingPackage (plain data) to an artifact. No method
 * touches a GPU, the network, or a secret.
 *
 * The package carries NO worker field; the worker decides WHERE to execute.
 */
import type {
  BundleFile,
  NotebookArtifact,
  ResumePlan,
  ResumeRequest,
  TrainingPackage,
  TrainingWorkerId,
  WorkerCapabilities,
  WorkerInstructions,
  WorkerStatus,
} from "@gharibo/shared";
import { kaggleTrainingWorker } from "./kaggle";

/**
 * The dataset JSONL contents for a bundle. A Training Package is content-free by
 * design (it carries hashes, not records), so the canonical lines are supplied at
 * bundle-assembly time.
 */
export interface BundleDatasetContents {
  train: string[];
  validation: string[];
  test: string[];
}

/** The worker interface. */
export interface TrainingWorker {
  readonly id: TrainingWorkerId;
  readonly displayName: string;
  readonly capabilities: WorkerCapabilities;

  /** Deterministic: same package → byte-identical notebook. No secrets, no personal paths. */
  renderNotebook(pkg: TrainingPackage): NotebookArtifact;

  /** The on-disk bundle layout (manifest + inputs + notebook + checksums). */
  buildBundle(pkg: TrainingPackage, contents?: BundleDatasetContents): BundleFile[];

  /** Exact operator steps to run this package on this worker. */
  instructions(pkg: TrainingPackage): WorkerInstructions;

  /** Normalises a worker-reported status into GHARIBO's resilience states (§10). */
  normalizeStatus(raw: unknown): WorkerStatus;

  /** Turns a resume request into the patch + steps for a NEW package. */
  planResume(req: ResumeRequest): ResumePlan;
}

/** The worker registry (discovery). Kaggle is Worker #1. */
export const TRAINING_WORKERS: readonly TrainingWorker[] = [kaggleTrainingWorker];

/** Runtime factory, mirroring `getProvider()`. */
export function getTrainingWorker(id: TrainingWorkerId): TrainingWorker {
  const found = TRAINING_WORKERS.find((w) => w.id === id);
  if (!found) {
    throw new Error(`Unknown training worker: ${id}`);
  }
  return found;
}
