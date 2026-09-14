/**
 * Datasets repository — create versioned dataset + attach records.
 * Maps SQLite rows ↔ Dataset domain objects.
 */
import { db } from "@/lib/db/index";
import type { Dataset, DatasetWithRecords } from "@gharibo/shared";
import { genId, now } from "@/lib/utils";

interface DatasetRow {
  id: string;
  name: string;
  version: string;
  record_count: number;
  created_at: string;
}

interface DatasetRecordRow {
  dataset_id: string;
  record_id: string;
}

function rowToDataset(row: DatasetRow): Dataset {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    recordCount: row.record_count,
    createdAt: row.created_at,
  };
}

export const datasetsRepository = {
  list(): Dataset[] {
    const rows = db().prepare("SELECT * FROM datasets ORDER BY created_at DESC").all() as DatasetRow[];
    return rows.map(rowToDataset);
  },

  get(id: string): DatasetWithRecords | null {
    const row = db().prepare("SELECT * FROM datasets WHERE id = ?").get(id) as DatasetRow | undefined;
    if (!row) return null;
    const recordRows = db()
      .prepare("SELECT record_id FROM dataset_records WHERE dataset_id = ?")
      .all(id) as DatasetRecordRow[];
    return {
      ...rowToDataset(row),
      records: recordRows.map((r) => ({ recordId: r.record_id })),
    };
  },

  /** Creates a dataset from a list of record IDs, auto-versioning. */
  create(name: string, recordIds: string[]): Dataset {
    const id = genId();
    const ts = now();

    // Determine next version for this name.
    const existing = db()
      .prepare("SELECT version FROM datasets WHERE name = ? ORDER BY created_at DESC")
      .all(name) as { version: string }[];
    const versionNum = existing.length + 1;
    const version = `v${versionNum}`;

    db()
      .prepare(
        `INSERT INTO datasets (id, name, version, record_count, created_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, name, version, recordIds.length, ts);

    // Attach records.
    if (recordIds.length > 0) {
      const insertStmt = db().prepare(
        "INSERT OR IGNORE INTO dataset_records (dataset_id, record_id) VALUES (?, ?)",
      );
      for (const recordId of recordIds) {
        insertStmt.run(id, recordId);
      }
    }

    return this.get(id) as unknown as Dataset;
  },

  /** Returns record IDs for a dataset. */
  getRecordIds(datasetId: string): string[] {
    const rows = db()
      .prepare("SELECT record_id FROM dataset_records WHERE dataset_id = ?")
      .all(datasetId) as DatasetRecordRow[];
    return rows.map((r) => r.record_id);
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM datasets WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
