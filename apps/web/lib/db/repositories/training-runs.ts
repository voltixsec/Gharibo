/**
 * Training runs repository — CRUD + status updates.
 * Maps SQLite rows ↔ TrainingRun domain objects.
 */
import { db } from "@/lib/db/index";
import type { TrainingRun, TrainingMethod, RunStatus } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface TrainingRunRow {
  run_id: string;
  base_model: string;
  method: string;
  dataset_id: string | null;
  dataset_version: string | null;
  train_examples: number | null;
  validation_examples: number | null;
  epochs: number | null;
  learning_rate: number | null;
  batch_size: number | null;
  gradient_accumulation: number | null;
  lora_rank: number | null;
  lora_alpha: number | null;
  target_modules: string;
  quantization: string | null;
  seed: number | null;
  device: string | null;
  status: string;
  start_time: string | null;
  end_time: string | null;
  checkpoint_path: string | null;
  logs: string | null;
  metrics: string;
  preflight_result: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRun(row: TrainingRunRow): TrainingRun {
  return {
    runId: row.run_id,
    baseModel: row.base_model,
    method: row.method as TrainingMethod,
    datasetId: row.dataset_id,
    datasetVersion: row.dataset_version,
    trainExamples: row.train_examples,
    validationExamples: row.validation_examples,
    epochs: row.epochs,
    learningRate: row.learning_rate,
    batchSize: row.batch_size,
    gradientAccumulation: row.gradient_accumulation,
    loraRank: row.lora_rank,
    loraAlpha: row.lora_alpha,
    targetModules: safeJsonParse(row.target_modules, []),
    quantization: row.quantization,
    seed: row.seed,
    device: row.device,
    status: row.status as RunStatus,
    startTime: row.start_time,
    endTime: row.end_time,
    checkpointPath: row.checkpoint_path,
    logs: row.logs,
    metrics: safeJsonParse(row.metrics, {}),
    preflightResult: row.preflight_result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const trainingRunsRepository = {
  list(): TrainingRun[] {
    const rows = db().prepare("SELECT * FROM training_runs ORDER BY created_at DESC").all() as TrainingRunRow[];
    return rows.map(rowToRun);
  },

  get(id: string): TrainingRun | null {
    const row = db().prepare("SELECT * FROM training_runs WHERE run_id = ?").get(id) as TrainingRunRow | undefined;
    return row ? rowToRun(row) : null;
  },

  create(input: Omit<TrainingRun, "runId" | "createdAt" | "updatedAt" | "status"> & { status?: RunStatus }): TrainingRun {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO training_runs (run_id, base_model, method, dataset_id, dataset_version,
         train_examples, validation_examples, epochs, learning_rate, batch_size, gradient_accumulation,
         lora_rank, lora_alpha, target_modules, quantization, seed, device, status,
         start_time, end_time, checkpoint_path, logs, metrics, preflight_result, created_at, updated_at)
         VALUES (@run_id, @base_model, @method, @dataset_id, @dataset_version,
         @train_examples, @validation_examples, @epochs, @learning_rate, @batch_size, @gradient_accumulation,
         @lora_rank, @lora_alpha, @target_modules, @quantization, @seed, @device, @status,
         @start_time, @end_time, @checkpoint_path, @logs, @metrics, @preflight_result, @created_at, @updated_at)`,
      )
      .run({
        run_id: id,
        base_model: input.baseModel,
        method: input.method,
        dataset_id: input.datasetId,
        dataset_version: input.datasetVersion,
        train_examples: input.trainExamples,
        validation_examples: input.validationExamples,
        epochs: input.epochs,
        learning_rate: input.learningRate,
        batch_size: input.batchSize,
        gradient_accumulation: input.gradientAccumulation,
        lora_rank: input.loraRank,
        lora_alpha: input.loraAlpha,
        target_modules: JSON.stringify(input.targetModules),
        quantization: input.quantization,
        seed: input.seed,
        device: input.device,
        status: input.status ?? "DRAFT",
        start_time: input.startTime,
        end_time: input.endTime,
        checkpoint_path: input.checkpointPath,
        logs: input.logs,
        metrics: JSON.stringify(input.metrics),
        preflight_result: input.preflightResult,
        created_at: ts,
        updated_at: ts,
      });
    return this.get(id)!;
  },

  update(id: string, patch: { status?: RunStatus; preflightResult?: string | null }): TrainingRun | null {
    const current = this.get(id);
    if (!current) return null;
    const ts = now();
    if (patch.status) {
      db().prepare("UPDATE training_runs SET status = ?, updated_at = ? WHERE run_id = ?").run(patch.status, ts, id);
    }
    if (patch.preflightResult !== undefined) {
      db().prepare("UPDATE training_runs SET preflight_result = ?, updated_at = ? WHERE run_id = ?").run(patch.preflightResult, ts, id);
    }
    return this.get(id);
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM training_runs WHERE run_id = ?").run(id);
    return result.changes > 0;
  },
};
