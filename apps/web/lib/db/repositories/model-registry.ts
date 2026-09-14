/**
 * Model registry repository — CRUD + promote(id, newStatus).
 * Maps SQLite rows ↔ ModelRegistryEntry domain objects.
 */
import { db } from "@/lib/db/index";
import type { ModelRegistryEntry, ModelStatus } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface ModelRegistryRow {
  id: string;
  model_name: string;
  version: string;
  base_model: string | null;
  training_run_id: string | null;
  dataset_version: string | null;
  training_method: string | null;
  checkpoint_location: string | null;
  adapter_location: string | null;
  evaluation_score: string;
  status: string;
  notes: string | null;
  created_date: string;
  updated_at: string;
}

function rowToEntry(row: ModelRegistryRow): ModelRegistryEntry {
  return {
    id: row.id,
    modelName: row.model_name,
    version: row.version,
    baseModel: row.base_model,
    trainingRunId: row.training_run_id,
    datasetVersion: row.dataset_version,
    trainingMethod: row.training_method,
    checkpointLocation: row.checkpoint_location,
    adapterLocation: row.adapter_location,
    evaluationScore: safeJsonParse(row.evaluation_score, {}),
    status: row.status as ModelStatus,
    notes: row.notes,
    createdDate: row.created_date,
    updatedAt: row.updated_at,
  };
}

export const modelRegistryRepository = {
  list(): ModelRegistryEntry[] {
    const rows = db().prepare("SELECT * FROM model_registry ORDER BY created_date DESC").all() as ModelRegistryRow[];
    return rows.map(rowToEntry);
  },

  get(id: string): ModelRegistryEntry | null {
    const row = db().prepare("SELECT * FROM model_registry WHERE id = ?").get(id) as ModelRegistryRow | undefined;
    return row ? rowToEntry(row) : null;
  },

  create(input: Omit<ModelRegistryEntry, "id" | "createdDate" | "updatedAt">): ModelRegistryEntry {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO model_registry (id, model_name, version, base_model, training_run_id,
         dataset_version, training_method, checkpoint_location, adapter_location,
         evaluation_score, status, notes, created_date, updated_at)
         VALUES (@id, @model_name, @version, @base_model, @training_run_id,
         @dataset_version, @training_method, @checkpoint_location, @adapter_location,
         @evaluation_score, @status, @notes, @created_date, @updated_at)`,
      )
      .run({
        id,
        model_name: input.modelName,
        version: input.version,
        base_model: input.baseModel,
        training_run_id: input.trainingRunId,
        dataset_version: input.datasetVersion,
        training_method: input.trainingMethod,
        checkpoint_location: input.checkpointLocation,
        adapter_location: input.adapterLocation,
        evaluation_score: JSON.stringify(input.evaluationScore),
        status: input.status,
        notes: input.notes,
        created_date: ts,
        updated_at: ts,
      });
    return this.get(id)!;
  },

  update(id: string, patch: { status?: ModelStatus; notes?: string | null }): ModelRegistryEntry | null {
    const current = this.get(id);
    if (!current) return null;
    const ts = now();
    if (patch.status) {
      db().prepare("UPDATE model_registry SET status = ?, updated_at = ? WHERE id = ?").run(patch.status, ts, id);
    }
    if (patch.notes !== undefined) {
      db().prepare("UPDATE model_registry SET notes = ?, updated_at = ? WHERE id = ?").run(patch.notes, ts, id);
    }
    return this.get(id);
  },

  /** Promotes a model to a new status (EXPERIMENT → CANDIDATE → ACCEPTED). */
  promote(id: string, newStatus: ModelStatus): ModelRegistryEntry | null {
    return this.update(id, { status: newStatus });
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM model_registry WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
