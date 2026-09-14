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
  // --- M2 additions (optional for pre-M2 rows) ---
  /** The content-addressed Training Package this experiment is based on. */
  packageId?: string | null;
  /** The canonical manifest JSON (snake_case) for the referenced package. */
  manifest?: Record<string, unknown>;
  /** Full provenance record (dataset/split hashes, git SHA, engine, env, rollup). */
  provenance?: Record<string, unknown>;
}
