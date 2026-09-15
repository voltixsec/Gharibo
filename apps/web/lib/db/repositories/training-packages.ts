/**
 * Training Packages repository — issued, immutable packages.
 * Maps SQLite rows ↔ TrainingPackageRow domain objects.
 *
 * `id` is the package content address (`package_id` = sha256 of the canonical
 * manifest), NOT a UUID — packages are content-addressed.
 */
import { db } from "@/lib/db/index";
import { now, safeJsonParse } from "@/lib/utils";
import { TRAINING_PACKAGE_SCHEMA_VERSION } from "@gharibo/shared";
import { computePackageIdFromManifest } from "@/lib/training/package";

export interface TrainingPackageRow {
  id: string;
  experimentId: string;
  schemaVersion: string;
  manifest: string;
  manifestHash: string;
  datasetId: string | null;
  datasetVersionId: string | null;
  runId: string | null;
  workerId: string;
  notebookSha256: string | null;
  bundlePath: string | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  experiment_id: string;
  schema_version: string;
  manifest: string;
  manifest_hash: string;
  dataset_id: string | null;
  dataset_version_id: string | null;
  run_id: string | null;
  worker_id: string;
  notebook_sha256: string | null;
  bundle_path: string | null;
  created_at: string;
}

function rowToPackage(row: RawRow): TrainingPackageRow {
  return {
    id: row.id,
    experimentId: row.experiment_id,
    schemaVersion: row.schema_version,
    manifest: row.manifest,
    manifestHash: row.manifest_hash,
    datasetId: row.dataset_id,
    datasetVersionId: row.dataset_version_id,
    runId: row.run_id,
    workerId: row.worker_id,
    notebookSha256: row.notebook_sha256,
    bundlePath: row.bundle_path,
    createdAt: row.created_at,
  };
}

export const trainingPackagesRepository = {
  /**
   * Persists an issued package. `id`/`manifestHash` are derived from the manifest
   * (content address); `schemaVersion` is read from the manifest.
   */
  create(input: {
    manifest: string;
    experimentId: string;
    datasetId: string | null;
    datasetVersionId: string | null;
    runId: string | null;
    notebookSha256: string | null;
    bundlePath: string | null;
    workerId?: string;
  }): TrainingPackageRow {
    const parsed = safeJsonParse<Record<string, unknown>>(input.manifest, {});
    if (Object.prototype.hasOwnProperty.call(parsed, "preview")) {
      throw new Error("PREVIEW packages cannot be persisted or issued");
    }
    const id = computePackageIdFromManifest(input.manifest);

    // Packages are immutable: an identical content address is a no-op (never replaced).
    const existing = this.get(id);
    if (existing) return existing;

    const schemaVersion =
      typeof parsed.schema_version === "string" ? parsed.schema_version : TRAINING_PACKAGE_SCHEMA_VERSION;
    const ts = now();

    db()
      .prepare(
        `INSERT INTO training_packages
         (id, experiment_id, schema_version, manifest, manifest_hash, dataset_id,
          dataset_version_id, run_id, worker_id, notebook_sha256, bundle_path, created_at)
         VALUES (@id, @experiment_id, @schema_version, @manifest, @manifest_hash, @dataset_id,
          @dataset_version_id, @run_id, @worker_id, @notebook_sha256, @bundle_path, @created_at)`,
      )
      .run({
        id,
        experiment_id: input.experimentId,
        schema_version: schemaVersion,
        manifest: input.manifest,
        manifest_hash: id,
        dataset_id: input.datasetId,
        dataset_version_id: input.datasetVersionId,
        run_id: input.runId,
        worker_id: input.workerId ?? "kaggle",
        notebook_sha256: input.notebookSha256,
        bundle_path: input.bundlePath,
        created_at: ts,
      });

    return this.get(id)!;
  },

  get(id: string): TrainingPackageRow | null {
    const row = db().prepare("SELECT * FROM training_packages WHERE id = ?").get(id) as RawRow | undefined;
    return row ? rowToPackage(row) : null;
  },

  listByExperiment(experimentId: string): TrainingPackageRow[] {
    const rows = db()
      .prepare("SELECT * FROM training_packages WHERE experiment_id = ? ORDER BY created_at DESC")
      .all(experimentId) as RawRow[];
    return rows.map(rowToPackage);
  },

  list(): TrainingPackageRow[] {
    const rows = db()
      .prepare("SELECT * FROM training_packages ORDER BY created_at DESC")
      .all() as RawRow[];
    return rows.map(rowToPackage);
  },

  getByRun(runId: string): TrainingPackageRow | null {
    const row = db()
      .prepare("SELECT * FROM training_packages WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(runId) as RawRow | undefined;
    return row ? rowToPackage(row) : null;
  },

  setBundlePath(id: string, bundlePath: string): void {
    db().prepare("UPDATE training_packages SET bundle_path = ? WHERE id = ?").run(bundlePath, id);
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM training_packages WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
