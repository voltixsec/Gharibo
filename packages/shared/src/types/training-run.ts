/**
 * Training run types.
 * @gharibo/shared
 */

/** Supported fine-tuning methods. */
export type TrainingMethod = "lora" | "qlora" | "sft";

/**
 * Training run lifecycle status.
 * M1: DRAFT, QUEUED, RUNNING, COMPLETED, FAILED, CANCELLED.
 * M2 adds: INTERRUPTED, RESUMABLE (free-tier resilience — §10).
 */
export type RunStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED"
  | "RESUMABLE";

/** A training run configuration + status. */
export interface TrainingRun {
  runId: string;
  baseModel: string;
  method: TrainingMethod;
  datasetId: string | null;
  datasetVersion: string | null;
  trainExamples: number | null;
  validationExamples: number | null;
  epochs: number | null;
  learningRate: number | null;
  batchSize: number | null;
  gradientAccumulation: number | null;
  loraRank: number | null;
  loraAlpha: number | null;
  targetModules: string[];
  quantization: string | null;
  seed: number | null;
  device: string | null;
  status: RunStatus;
  startTime: string | null;
  endTime: string | null;
  checkpointPath: string | null;
  logs: string | null;
  metrics: Record<string, unknown>;
  preflightResult: string | null;
  createdAt: string;
  updatedAt: string;
  // --- M2 additions: engine values the package derives from (never hardcoded) ---
  maxSeqLength?: number | null;
  optimizer?: string | null;
  warmupSteps?: number | null;
  lrSchedulerType?: string | null;
  weightDecay?: number | null;
  dtype?: string | null;
  saveStrategy?: string | null;
  saveSteps?: number | null;
  saveTotalLimit?: number | null;
  baseModelRevision?: string | null;
  loaderModelId?: string | null;
  workerId?: string | null;
  packageId?: string | null;
  resumeFromCheckpoint?: string | null;
}
