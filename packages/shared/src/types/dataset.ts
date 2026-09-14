/**
 * Dataset types — versioned, content-addressed collections of approved records.
 * @gharibo/shared
 *
 * M2 (additive): a dataset version is content-addressed (order-independent hash),
 * immutable once cut, and carries deterministic, seeded, hashed splits.
 */

/** Split names for deterministic dataset splits. */
export type SplitName = "train" | "validation" | "test";

/** Per-split content hashes (sha256 hex, order-independent). */
export interface SplitHashes {
  train: string;
  validation: string;
  test: string;
}

/** Deterministic, seeded split rule (architecture M2 §3.1). */
export interface SplitPolicy {
  algorithm: "seeded-shuffle-sha256";
  seed: number;
  /** Ratios summing to 1.0. */
  ratios: { train: number; validation: number; test: number };
  /** Each split must contain at least this many records, else the cut fails loudly. */
  minimumRecordsPerSplit: number;
}

/** Dataset-version lifecycle status. Only `TRAINING_READY` versions may be exported. */
export type DatasetVersionStatus = "DRAFT" | "TRAINING_READY";

/** A versioned, frozen dataset snapshot. */
export interface Dataset {
  id: string;
  name: string;
  version: string;
  recordCount: number;
  createdAt: string;
  // --- M2 additions (optional; null/undefined for pre-M2 rows) ---
  /** Order-independent sha256 content hash of the version (null until cut). */
  datasetHash?: string | null;
  /** Content address; equals datasetHash (null until cut). */
  datasetVersionId?: string | null;
  /** The split rule used to cut this version (null until cut). */
  splitPolicy?: SplitPolicy | null;
  /** Per-split hashes (null until cut). */
  splitHashes?: SplitHashes | null;
  /** Lifecycle status; only `TRAINING_READY` is exportable. */
  status?: DatasetVersionStatus;
  /** Package schema version recorded on the row. */
  schemaVersion?: string;
  /** The DRAFT dataset this version was cut from, if any. */
  parentDatasetId?: string | null;
}

/** Dataset with its full records (used in GET /datasets/:id). */
export interface DatasetWithRecords extends Dataset {
  records: Array<{
    recordId: string;
  }>;
}

/** Dataset with its deterministic split membership (M2). */
export interface DatasetWithSplits extends Dataset {
  splits: Record<SplitName, string[]>;
}
