/**
 * Datasets repository — content-addressed, immutable versioned datasets + splits.
 * Maps SQLite rows ↔ Dataset domain objects.
 *
 * M2: `cutVersion` replaces the naive monotonic counter. A version is cut from
 * `TRAINING_READY` records only; it is content-addressed (order-independent hash)
 * and carries deterministic, seeded, hashed splits. Re-cutting identical inputs
 * reproduces identical hashes.
 */
import { db } from "@/lib/db/index";
import type {
  Dataset,
  DatasetWithRecords,
  DatasetWithSplits,
  SplitHashes,
  SplitName,
  SplitPolicy,
} from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";
import { canonicalLine, datasetHashFromLines, recordLineHash, toCanonicalInput } from "@/lib/training/canonical";
import { computeSplits } from "@/lib/training/split";
import { dataFactoryRepository } from "./data-factory";

interface DatasetRow {
  id: string;
  name: string;
  version: string;
  record_count: number;
  created_at: string;
  dataset_hash: string | null;
  dataset_version_id: string | null;
  split_policy: string | null;
  split_hashes: string | null;
  schema_version: string | null;
  status: string | null;
  parent_dataset_id: string | null;
}

interface DatasetRecordRow {
  dataset_id: string;
  record_id: string;
}

function parseSplitPolicy(raw: string | null): SplitPolicy | null {
  const v = safeJsonParse<Record<string, unknown>>(raw, {});
  if (v && typeof v.algorithm === "string" && v.ratios) return v as unknown as SplitPolicy;
  return null;
}

function parseSplitHashes(raw: string | null): SplitHashes | null {
  const v = safeJsonParse<Record<string, unknown>>(raw, {});
  if (v && typeof v.train === "string" && typeof v.validation === "string" && typeof v.test === "string") {
    return v as unknown as SplitHashes;
  }
  return null;
}

function rowToDataset(row: DatasetRow): Dataset {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    recordCount: row.record_count,
    createdAt: row.created_at,
    datasetHash: row.dataset_hash,
    datasetVersionId: row.dataset_version_id,
    splitPolicy: parseSplitPolicy(row.split_policy),
    splitHashes: parseSplitHashes(row.split_hashes),
    status: row.status === "TRAINING_READY" ? "TRAINING_READY" : "DRAFT",
    schemaVersion: row.schema_version ?? "1.0.0",
    parentDatasetId: row.parent_dataset_id,
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

  /** Creates a DRAFT dataset from a list of record IDs (M1 behavior). */
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
        `INSERT INTO datasets (id, name, version, record_count, created_at, status, schema_version)
         VALUES (?, ?, ?, ?, ?, 'DRAFT', '1.0.0')`,
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

  /**
   * Cuts a NEW content-addressed, immutable dataset version from `recordIds`.
   *
   * - Only `TRAINING_READY` records may enter a version (§7.3) — otherwise throws.
   * - Computes the order-independent dataset hash and the deterministic splits.
   * - Fails loudly (EmptySplitError) if any split is below the minimum.
   * - If an identical version already exists (same datasetHash), reuses it.
   */
  cutVersion(input: { name: string; recordIds: string[]; splitPolicy: SplitPolicy }): DatasetWithSplits {
    // 1. Load records and enforce the Gold Pipeline gate.
    const records = input.recordIds
      .map((rid) => dataFactoryRepository.get(rid))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (records.length !== input.recordIds.length) {
      const found = new Set(records.map((r) => r.id));
      const missing = input.recordIds.filter((id) => !found.has(id));
      throw new Error(`Dataset cut failed: ${missing.length} record(s) not found: ${missing.join(", ")}`);
    }

    const notReady = records.filter((r) => r.verificationStatus !== "TRAINING_READY");
    if (notReady.length > 0) {
      throw new Error(
        `Dataset cut failed: ${notReady.length} record(s) are not TRAINING_READY ` +
          `(ids: ${notReady.slice(0, 5).map((r) => r.id).join(", ")}${notReady.length > 5 ? ", …" : ""})`,
      );
    }

    // 2. Canonical lines + per-record hashes.
    const lines: string[] = [];
    const lineHashes: string[] = [];
    const byId = new Map<string, { lineHash: string }>();
    for (const r of records) {
      const canonical = toCanonicalInput(r);
      const line = canonicalLine(canonical);
      lines.push(line);
      const lh = recordLineHash(canonical);
      lineHashes.push(lh);
      byId.set(r.id, { lineHash: lh });
    }

    // 3. Order-independent dataset hash (content address).
    const datasetHash = datasetHashFromLines(lines);

    // 4. Content-addressed dedupe: reuse an identical version if one exists.
    const existing = this.getByHash(datasetHash);
    if (existing) {
      return { ...existing, splits: this.getSplits(existing.id) };
    }

    // 5. Deterministic splits (fails loudly on an undersized split).
    const splitResult = computeSplits(
      records.map((r) => ({ id: r.id, lineHash: byId.get(r.id)!.lineHash })),
      input.splitPolicy,
    );

    // 6. Persist the new immutable version + its split membership.
    const id = genId();
    const ts = now();
    const existingVersions = db()
      .prepare("SELECT version FROM datasets WHERE name = ? ORDER BY created_at DESC")
      .all(input.name) as { version: string }[];
    const version = `v${existingVersions.length + 1}`;

    db()
      .prepare(
        `INSERT INTO datasets
         (id, name, version, record_count, created_at, dataset_hash, dataset_version_id,
          split_policy, split_hashes, schema_version, status, parent_dataset_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '1.0.0', 'TRAINING_READY', NULL)`,
      )
      .run(
        id,
        input.name,
        version,
        records.length,
        ts,
        datasetHash,
        datasetHash,
        JSON.stringify(input.splitPolicy),
        JSON.stringify(splitResult.splitHashes),
      );

    // Attach records (membership of the version).
    const attach = db().prepare(
      "INSERT OR IGNORE INTO dataset_records (dataset_id, record_id) VALUES (?, ?)",
    );
    for (const r of records) attach.run(id, r.id);

    // Persist deterministic split membership.
    const splitRows: Array<{ splitName: SplitName; recordId: string; recordLineHash: string }> = [];
    for (const name of ["train", "validation", "test"] as const) {
      for (const recordId of splitResult.splits[name]) {
        splitRows.push({ splitName: name, recordId, recordLineHash: byId.get(recordId)!.lineHash });
      }
    }
    const insertSplit = db().prepare(
      `INSERT OR REPLACE INTO dataset_splits (dataset_id, split_name, record_id, record_line_hash)
       VALUES (?, ?, ?, ?)`,
    );
    for (const s of splitRows) insertSplit.run(id, s.splitName, s.recordId, s.recordLineHash);

    // Read splits back through `getSplits` (canonical order) so the fresh-cut
    // path and the dedupe path return byte-identical ordering for the same
    // package — `computeSplits` still owns split *membership*.
    return { ...(this.get(id) as unknown as Dataset), splits: this.getSplits(id) };
  },

  /** Returns the dataset version with the given content hash, if any. */
  getByHash(datasetHash: string): Dataset | null {
    const row = db().prepare("SELECT * FROM datasets WHERE dataset_hash = ?").get(datasetHash) as
      | DatasetRow
      | undefined;
    return row ? rowToDataset(row) : null;
  },

  /**
   * Returns deterministic split membership for a dataset version.
   *
   * Rows are ordered by `(split_name, record_line_hash, record_id)` so that
   * every caller — the fresh-cut path, the content-addressed dedupe path, and
   * bundle re-assembly — emits identical intra-split ordering. Without this,
   * the per-file sha256 in CHECKSUMS.sha256 could differ between the initial
   * build and a later re-assembly of the SAME immutable package (ADR-0012).
   * Records with identical canonical content share a `record_line_hash`; the
   * `record_id` tiebreak keeps the JS array order stable, and such records map
   * to identical JSONL lines anyway, so file bytes are unaffected by the tie.
   */
  getSplits(datasetId: string): Record<SplitName, string[]> {
    const rows = db()
      .prepare(
        `SELECT split_name, record_id FROM dataset_splits
         WHERE dataset_id = ?
         ORDER BY split_name, record_line_hash, record_id`,
      )
      .all(datasetId) as { split_name: string; record_id: string }[];
    const splits: Record<SplitName, string[]> = { train: [], validation: [], test: [] };
    for (const r of rows) {
      if (r.split_name === "train" || r.split_name === "validation" || r.split_name === "test") {
        splits[r.split_name].push(r.record_id);
      }
    }
    return splits;
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
