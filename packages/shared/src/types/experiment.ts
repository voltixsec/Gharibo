/**
 * Experiment types — reproducibility and lineage.
 * @gharibo/shared
 */

/** A reproducible experiment record. */
export interface Experiment {
  id: string;
  codeVersion: string | null;
  modelId: string | null;
  datasetVersion: string | null;
  configuration: Record<string, unknown>;
  seed: number | null;
  results: Record<string, unknown>;
  notes: string | null;
  trainingRunId: string | null;
  createdAt: string;
  updatedAt: string;
}
