/**
 * Data Factory record types.
 * @gharibo/shared
 */

/** Pipeline states for data factory records. */
export type VerificationStatus =
  | "RAW"
  | "NORMALIZED"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "TRAINING_READY";

/** Validation result status per validator. */
export type ValidationStatus = "PASS" | "WARNING" | "FAIL";

/** A single validation result from the validation engine. */
export interface ValidationResult {
  validator: string;
  status: ValidationStatus;
  message: string;
}

/** A data factory record — the core unit of the data pipeline. */
export interface DataFactoryRecord {
  id: string;
  taskType: string | null;
  domain: string | null;
  language: string | null;
  input: string;
  context: string | null;
  expectedOutput: string | null;
  chosenOutput: string | null;
  rejectedOutput: string | null;
  /** Chain-of-thought reasoning; maps to the Harmony `analysis` channel (never user-facing). */
  reasoning?: string | null;
  source: string | null;
  sourceUrl: string | null;
  license: string | null;
  verificationStatus: VerificationStatus;
  qualityScore: number | null;
  difficulty: string | null;
  tags: string[];
  validationResults: ValidationResult[];
  sourceTrainingExampleId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Timestamp of the last Gold Pipeline transition (M2 audit). */
  pipelineUpdatedAt?: string | null;
}
