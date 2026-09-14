/**
 * Dataset splits repository — deterministic split membership per dataset version.
 * Maps SQLite rows ↔ split membership rows.
 */
import { db } from "@/lib/db/index";
import type { SplitName } from "@gharibo/shared";

export interface DatasetSplitRow {
  splitName: SplitName;
  recordId: string;
  recordLineHash: string;
}

interface RawRow {
  dataset_id: string;
  split_name: string;
  record_id: string;
  record_line_hash: string;
}

function rowToSplit(row: RawRow): DatasetSplitRow {
  return {
    splitName: row.split_name as SplitName,
    recordId: row.record_id,
    recordLineHash: row.record_line_hash,
  };
}

export const datasetSplitsRepository = {
  /** Replaces all split rows for a dataset version (idempotent re-cut). */
  replace(
    datasetId: string,
    rows: Array<{ splitName: SplitName; recordId: string; recordLineHash: string }>,
  ): void {
    const run = db().transaction(() => {
      db().prepare("DELETE FROM dataset_splits WHERE dataset_id = ?").run(datasetId);
      const insert = db().prepare(
        `INSERT OR REPLACE INTO dataset_splits (dataset_id, split_name, record_id, record_line_hash)
         VALUES (?, ?, ?, ?)`,
      );
      for (const r of rows) {
        insert.run(datasetId, r.splitName, r.recordId, r.recordLineHash);
      }
    });
    run();
  },

  listByDataset(datasetId: string): DatasetSplitRow[] {
    const rows = db()
      .prepare("SELECT * FROM dataset_splits WHERE dataset_id = ? ORDER BY split_name, record_id")
      .all(datasetId) as RawRow[];
    return rows.map(rowToSplit);
  },

  /** Record ids for one split of a dataset version. */
  listBySplit(datasetId: string, splitName: SplitName): string[] {
    const rows = db()
      .prepare("SELECT record_id FROM dataset_splits WHERE dataset_id = ? AND split_name = ?")
      .all(datasetId, splitName) as { record_id: string }[];
    return rows.map((r) => r.record_id);
  },

  /** Counts per split for a dataset version. */
  counts(datasetId: string): Record<SplitName, number> {
    const rows = db()
      .prepare("SELECT split_name, COUNT(*) as count FROM dataset_splits WHERE dataset_id = ? GROUP BY split_name")
      .all(datasetId) as { split_name: string; count: number }[];
    const counts: Record<SplitName, number> = { train: 0, validation: 0, test: 0 };
    for (const r of rows) {
      if (r.split_name === "train" || r.split_name === "validation" || r.split_name === "test") {
        counts[r.split_name] = r.count;
      }
    }
    return counts;
  },
};
