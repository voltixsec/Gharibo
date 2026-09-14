/**
 * Training runs repository — CRUD + guarded status transitions + package linkage.
 * Maps SQLite rows ↔ TrainingRun domain objects.
 *
 * M2: `transition` enforces the resilience state machine (§10.2) server-side and
 * appends a `training_run_events` audit row; `setPackage` links the issued package.
 */
import { db } from "@/lib/db/index";
import type { TrainingRun, TrainingMethod, RunStatus } from "@gharibo/shared";
import { HttpError } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";
import { trainingRunEventsRepository } from "./training-run-events";

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
  max_seq_length: number | null;
  optimizer: string | null;
  warmup_steps: number | null;
  lr_scheduler_type: string | null;
  weight_decay: number | null;
  dtype: string | null;
  save_strategy: string | null;
  save_steps: number | null;
  save_total_limit: number | null;
  base_model_revision: string | null;
  loader_model_id: string | null;
  worker_id: string | null;
  package_id: string | null;
  resume_from_checkpoint: string | null;
}

/** Allowed transitions (§10.2). Any transition not listed is rejected (400). */
export const ALLOWED_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  DRAFT: ["QUEUED"],
  QUEUED: ["RUNNING"],
  RUNNING: ["COMPLETED", "FAILED", "INTERRUPTED", "CANCELLED"],
  INTERRUPTED: ["RESUMABLE", "FAILED"],
  RESUMABLE: ["QUEUED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

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
    maxSeqLength: row.max_seq_length,
    optimizer: row.optimizer,
    warmupSteps: row.warmup_steps,
    lrSchedulerType: row.lr_scheduler_type,
    weightDecay: row.weight_decay,
    dtype: row.dtype,
    saveStrategy: row.save_strategy,
    saveSteps: row.save_steps,
    saveTotalLimit: row.save_total_limit,
    baseModelRevision: row.base_model_revision,
    loaderModelId: row.loader_model_id,
    workerId: row.worker_id,
    packageId: row.package_id,
    resumeFromCheckpoint: row.resume_from_checkpoint,
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

  create(
    input: Omit<TrainingRun, "runId" | "createdAt" | "updatedAt" | "status"> & { status?: RunStatus },
  ): TrainingRun {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO training_runs (run_id, base_model, method, dataset_id, dataset_version,
         train_examples, validation_examples, epochs, learning_rate, batch_size, gradient_accumulation,
         lora_rank, lora_alpha, target_modules, quantization, seed, device, status,
         start_time, end_time, checkpoint_path, logs, metrics, preflight_result, created_at, updated_at,
         max_seq_length, optimizer, warmup_steps, lr_scheduler_type, weight_decay, dtype,
         save_strategy, save_steps, save_total_limit, base_model_revision, loader_model_id,
         worker_id, package_id, resume_from_checkpoint)
         VALUES (@run_id, @base_model, @method, @dataset_id, @dataset_version,
         @train_examples, @validation_examples, @epochs, @learning_rate, @batch_size, @gradient_accumulation,
         @lora_rank, @lora_alpha, @target_modules, @quantization, @seed, @device, @status,
         @start_time, @end_time, @checkpoint_path, @logs, @metrics, @preflight_result, @created_at, @updated_at,
         @max_seq_length, @optimizer, @warmup_steps, @lr_scheduler_type, @weight_decay, @dtype,
         @save_strategy, @save_steps, @save_total_limit, @base_model_revision, @loader_model_id,
         @worker_id, @package_id, @resume_from_checkpoint)`,
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
        max_seq_length: input.maxSeqLength ?? null,
        optimizer: input.optimizer ?? null,
        warmup_steps: input.warmupSteps ?? null,
        lr_scheduler_type: input.lrSchedulerType ?? null,
        weight_decay: input.weightDecay ?? null,
        dtype: input.dtype ?? null,
        save_strategy: input.saveStrategy ?? null,
        save_steps: input.saveSteps ?? null,
        save_total_limit: input.saveTotalLimit ?? null,
        base_model_revision: input.baseModelRevision ?? null,
        loader_model_id: input.loaderModelId ?? null,
        worker_id: input.workerId ?? null,
        package_id: input.packageId ?? null,
        resume_from_checkpoint: input.resumeFromCheckpoint ?? null,
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

  /**
   * Guarded status transition (§10.2). Rejects any transition not in the state
   * machine with a 400 and appends a `training_run_events` audit row.
   */
  transition(id: string, to: RunStatus, opts: { reason?: string; source: string }): TrainingRun | null {
    const current = this.get(id);
    if (!current) return null;
    const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
    if (!allowed.includes(to)) {
      throw new HttpError(400, `Illegal transition ${current.status} → ${to}`);
    }
    const ts = now();
    db().prepare("UPDATE training_runs SET status = ?, updated_at = ? WHERE run_id = ?").run(to, ts, id);
    trainingRunEventsRepository.append({
      runId: id,
      fromStatus: current.status,
      toStatus: to,
      reason: opts.reason ?? null,
      source: opts.source,
    });
    return this.get(id);
  },

  /** Links an issued Training Package to this run. */
  setPackage(id: string, packageId: string): TrainingRun | null {
    const current = this.get(id);
    if (!current) return null;
    db()
      .prepare("UPDATE training_runs SET package_id = ?, updated_at = ? WHERE run_id = ?")
      .run(packageId, now(), id);
    return this.get(id);
  },

  /** Persists the resume point (used when a resume package is issued). */
  setResumeFromCheckpoint(id: string, checkpoint: string | null): TrainingRun | null {
    const current = this.get(id);
    if (!current) return null;
    db()
      .prepare("UPDATE training_runs SET resume_from_checkpoint = ?, updated_at = ? WHERE run_id = ?")
      .run(checkpoint, now(), id);
    return this.get(id);
  },

  /** Persists imported metrics (real values only — never fabricated). */
  setMetrics(id: string, metrics: Record<string, unknown>): TrainingRun | null {
    const current = this.get(id);
    if (!current) return null;
    db()
      .prepare("UPDATE training_runs SET metrics = ?, updated_at = ? WHERE run_id = ?")
      .run(JSON.stringify(metrics), now(), id);
    return this.get(id);
  },

  /** Records the terminal timestamps for a finished run. */
  setTimes(id: string, times: { startTime?: string | null; endTime?: string | null }): TrainingRun | null {
    const current = this.get(id);
    if (!current) return null;
    const ts = now();
    if (times.startTime !== undefined) {
      db().prepare("UPDATE training_runs SET start_time = ?, updated_at = ? WHERE run_id = ?").run(times.startTime, ts, id);
    }
    if (times.endTime !== undefined) {
      db().prepare("UPDATE training_runs SET end_time = ?, updated_at = ? WHERE run_id = ?").run(times.endTime, ts, id);
    }
    return this.get(id);
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM training_runs WHERE run_id = ?").run(id);
    return result.changes > 0;
  },
};
