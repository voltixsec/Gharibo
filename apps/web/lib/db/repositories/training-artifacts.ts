/**
 * Training artifacts repository — per-file artifact integrity hashes
 * (manifest-of-hashes, architecture M2 §5.3).
 */
import { db } from "@/lib/db/index";
import { genId, now } from "@/lib/utils";
import { HttpError } from "@gharibo/shared";

/**
 * Path prefixes that are produced by the engine but are NOT model artifacts.
 *
 * Unsloth writes a compiled-cache tree next to the adapter on the worker. It is
 * build output, not a result: it is not reproducible, it is not content-addressed
 * as an artifact, and registering it would pollute the manifest-of-hashes with
 * machine-specific bytes. It must never enter the artifact registry.
 */
export const NON_ARTIFACT_PREFIXES: readonly string[] = ["unsloth_compiled_cache/"];

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
    const rejected = rows.find((r) =>
      NON_ARTIFACT_PREFIXES.some((prefix) => r.relativePath.startsWith(prefix)),
    );
    if (rejected) {
      throw new HttpError(
        400,
        `${rejected.relativePath} is engine build output, not a model artifact, and must not be registered`,
      );
    }
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
