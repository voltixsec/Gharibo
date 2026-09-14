/**
 * Training run types.
 * @gharibo/shared
 */

/** Supported fine-tuning methods. */
export type TrainingMethod = "lora" | "qlora" | "sft";

/** Training run lifecycle status. */
export type RunStatus =
  | "DRAFT"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

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
}
