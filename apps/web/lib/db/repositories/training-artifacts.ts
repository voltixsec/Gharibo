/**
 * Training artifacts repository — per-file artifact integrity hashes
 * (manifest-of-hashes, architecture M2 §5.3).
 */
import { db } from "@/lib/db/index";
import { genId, now } from "@/lib/utils";

export interface TrainingArtifactRow {
  id: string;
  packageId: string;
  relativePath: string;
  kind: string;
  sha256: string;
  sizeBytes: number;
  rollupHash: string | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  package_id: string;
  relative_path: string;
  kind: string;
  sha256: string;
  size_bytes: number;
  rollup_hash: string | null;
  created_at: string;
}

function rowToArtifact(row: RawRow): TrainingArtifactRow {
  return {
    id: row.id,
    packageId: row.package_id,
    relativePath: row.relative_path,
    kind: row.kind,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    rollupHash: row.rollup_hash,
    createdAt: row.created_at,
  };
}

export const trainingArtifactsRepository = {
  /** Replaces all artifact rows for a package and records the rollup hash. */
  replaceForPackage(
    packageId: string,
    rows: Array<{ relativePath: string; kind: string; sha256: string; sizeBytes: number }>,
    rollupHash: string,
  ): void {
    const run = db().transaction(() => {
      db().prepare("DELETE FROM training_artifacts WHERE package_id = ?").run(packageId);
      const insert = db().prepare(
        `INSERT INTO training_artifacts
         (id, package_id, relative_path, kind, sha256, size_bytes, rollup_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const ts = now();
      for (const r of rows) {
        insert.run(genId(), packageId, r.relativePath, r.kind, r.sha256, r.sizeBytes, rollupHash, ts);
      }
    });
    run();
  },

  listByPackage(packageId: string): TrainingArtifactRow[] {
    const rows = db()
      .prepare("SELECT * FROM training_artifacts WHERE package_id = ? ORDER BY relative_path")
      .all(packageId) as RawRow[];
    return rows.map(rowToArtifact);
  },
};
