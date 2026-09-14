/**
 * Experiments repository — CRUD.
 * Maps SQLite rows ↔ Experiment domain objects.
 */
import { db } from "@/lib/db/index";
import type { Experiment } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface ExperimentRow {
  id: string;
  code_version: string | null;
  model_id: string | null;
  dataset_version: string | null;
  configuration: string;
  seed: number | null;
  results: string;
  notes: string | null;
  training_run_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToExperiment(row: ExperimentRow): Experiment {
  return {
    id: row.id,
    codeVersion: row.code_version,
    modelId: row.model_id,
    datasetVersion: row.dataset_version,
    configuration: safeJsonParse(row.configuration, {}),
    seed: row.seed,
    results: safeJsonParse(row.results, {}),
    notes: row.notes,
    trainingRunId: row.training_run_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const experimentsRepository = {
  list(): Experiment[] {
    const rows = db().prepare("SELECT * FROM experiments ORDER BY created_at DESC").all() as ExperimentRow[];
    return rows.map(rowToExperiment);
  },

  get(id: string): Experiment | null {
    const row = db().prepare("SELECT * FROM experiments WHERE id = ?").get(id) as ExperimentRow | undefined;
    return row ? rowToExperiment(row) : null;
  },

  create(input: Omit<Experiment, "id" | "createdAt" | "updatedAt">): Experiment {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO experiments (id, code_version, model_id, dataset_version, configuration,
         seed, results, notes, training_run_id, created_at, updated_at)
         VALUES (@id, @code_version, @model_id, @dataset_version, @configuration,
         @seed, @results, @notes, @training_run_id, @created_at, @updated_at)`,
      )
      .run({
        id,
        code_version: input.codeVersion,
        model_id: input.modelId,
        dataset_version: input.datasetVersion,
        configuration: JSON.stringify(input.configuration),
        seed: input.seed,
        results: JSON.stringify(input.results),
        notes: input.notes,
        training_run_id: input.trainingRunId,
        created_at: ts,
        updated_at: ts,
      });
    return this.get(id)!;
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM experiments WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
