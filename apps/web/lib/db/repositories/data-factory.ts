/**
 * Data Factory records repository — CRUD + search/filter + bulk + status transitions.
 * Maps SQLite rows ↔ DataFactoryRecord domain objects.
 *
 * M2: `transition` enforces the Gold Pipeline server-side (§7.3) — this is NEW
 * enforcement; M1 enforced nothing server-side.
 */
import { db } from "@/lib/db/index";
import type { DataFactoryRecord, VerificationStatus, ValidationResult } from "@gharibo/shared";
import { HttpError } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface DataFactoryRow {
  id: string;
  task_type: string | null;
  domain: string | null;
  language: string | null;
  input: string;
  context: string | null;
  expected_output: string | null;
  chosen_output: string | null;
  rejected_output: string | null;
  reasoning: string | null;
  source: string | null;
  source_url: string | null;
  license: string | null;
  verification_status: string;
  quality_score: number | null;
  difficulty: string | null;
  tags: string;
  validation_results: string;
  source_training_example_id: string | null;
  created_at: string;
  updated_at: string;
  pipeline_updated_at: string | null;
}

function rowToRecord(row: DataFactoryRow): DataFactoryRecord {
  return {
    id: row.id,
    taskType: row.task_type,
    domain: row.domain,
    language: row.language,
    input: row.input,
    context: row.context,
    expectedOutput: row.expected_output,
    chosenOutput: row.chosen_output,
    rejectedOutput: row.rejected_output,
    reasoning: row.reasoning,
    source: row.source,
    sourceUrl: row.source_url,
    license: row.license,
    verificationStatus: row.verification_status as VerificationStatus,
    qualityScore: row.quality_score,
    difficulty: row.difficulty,
    tags: safeJsonParse(row.tags, []),
    validationResults: safeJsonParse(row.validation_results, []),
    sourceTrainingExampleId: row.source_training_example_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pipelineUpdatedAt: row.pipeline_updated_at,
  };
}

/**
 * Allowed Gold Pipeline transitions (§7.3).
 * RAW → NORMALIZED → REVIEW_REQUIRED → APPROVED → TRAINING_READY,
 * with REVIEW_REQUIRED → REJECTED.
 */
export const ALLOWED_VERIFICATION_TRANSITIONS: Record<VerificationStatus, VerificationStatus[]> = {
  RAW: ["NORMALIZED"],
  NORMALIZED: ["REVIEW_REQUIRED"],
  REVIEW_REQUIRED: ["APPROVED", "REJECTED"],
  APPROVED: ["TRAINING_READY"],
  TRAINING_READY: [],
  REJECTED: [],
};

export interface ListOptions {
  status?: VerificationStatus;
  domain?: string;
  search?: string;
  page: number;
  pageSize: number;
}

export const dataFactoryRepository = {
  list(opts: ListOptions): { rows: DataFactoryRecord[]; total: number } {
    let sql = "SELECT * FROM data_factory_records WHERE 1=1";
    const params: (string | number)[] = [];

    if (opts.status) {
      sql += " AND verification_status = ?";
      params.push(opts.status);
    }
    if (opts.domain) {
      sql += " AND domain = ?";
      params.push(opts.domain);
    }
    if (opts.search) {
      sql += " AND (input LIKE ? OR chosen_output LIKE ? OR domain LIKE ?)";
      params.push(`%${opts.search}%`, `%${opts.search}%`, `%${opts.search}%`);
    }

    // Count total
    const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count");
    const countResult = db().prepare(countSql).get(...params) as { count: number };
    const total = countResult.count;

    // Paginate
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(opts.pageSize, (opts.page - 1) * opts.pageSize);
    const rows = db().prepare(sql).all(...params) as DataFactoryRow[];

    return { rows: rows.map(rowToRecord), total };
  },

  get(id: string): DataFactoryRecord | null {
    const row = db().prepare("SELECT * FROM data_factory_records WHERE id = ?").get(id) as DataFactoryRow | undefined;
    return row ? rowToRecord(row) : null;
  },

  create(input: Omit<DataFactoryRecord, "id" | "createdAt" | "updatedAt">): DataFactoryRecord {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO data_factory_records (id, task_type, domain, language, input, context,
         expected_output, chosen_output, rejected_output, reasoning, source, source_url, license,
         verification_status, quality_score, difficulty, tags, validation_results,
         source_training_example_id, created_at, updated_at, pipeline_updated_at)
         VALUES (@id, @task_type, @domain, @language, @input, @context,
         @expected_output, @chosen_output, @rejected_output, @reasoning, @source, @source_url, @license,
         @verification_status, @quality_score, @difficulty, @tags, @validation_results,
         @source_training_example_id, @created_at, @updated_at, @pipeline_updated_at)`,
      )
      .run({
        id,
        task_type: input.taskType,
        domain: input.domain,
        language: input.language,
        input: input.input,
        context: input.context,
        expected_output: input.expectedOutput,
        chosen_output: input.chosenOutput,
        rejected_output: input.rejectedOutput,
        reasoning: input.reasoning ?? null,
        source: input.source,
        source_url: input.sourceUrl,
        license: input.license,
        verification_status: input.verificationStatus,
        quality_score: input.qualityScore,
        difficulty: input.difficulty,
        tags: JSON.stringify(input.tags),
        validation_results: JSON.stringify(input.validationResults),
        source_training_example_id: input.sourceTrainingExampleId,
        created_at: ts,
        updated_at: ts,
        pipeline_updated_at: ts,
      });
    return this.get(id)!;
  },

  update(id: string, patch: Partial<DataFactoryRecord>): DataFactoryRecord | null {
    const current = this.get(id);
    if (!current) return null;
    const ts = now();
    const merged = { ...current, ...patch, id, updatedAt: ts };

    db()
      .prepare(
        `UPDATE data_factory_records SET task_type = ?, domain = ?, language = ?, input = ?,
         context = ?, expected_output = ?, chosen_output = ?, rejected_output = ?, reasoning = ?,
         source = ?, source_url = ?, license = ?, verification_status = ?, quality_score = ?, difficulty = ?,
         tags = ?, validation_results = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        merged.taskType,
        merged.domain,
        merged.language,
        merged.input,
        merged.context,
        merged.expectedOutput,
        merged.chosenOutput,
        merged.rejectedOutput,
        merged.reasoning ?? null,
        merged.source,
        merged.sourceUrl,
        merged.license,
        merged.verificationStatus,
        merged.qualityScore,
        merged.difficulty,
        JSON.stringify(merged.tags),
        JSON.stringify(merged.validationResults),
        ts,
        id,
      );
    return this.get(id);
  },

  /**
   * Server-side Gold Pipeline transition (§7.3). Rejects any illegal move with a 400
   * and records `pipeline_updated_at`. This closes the M1 gap where the state machine
   * was enforced only in the UI.
   */
  transition(id: string, to: VerificationStatus, opts?: { reason?: string }): DataFactoryRecord {
    const current = this.get(id);
    if (!current) throw new HttpError(404, "Data Factory record not found");
    const allowed = ALLOWED_VERIFICATION_TRANSITIONS[current.verificationStatus] ?? [];
    if (!allowed.includes(to)) {
      throw new HttpError(400, `Illegal pipeline transition ${current.verificationStatus} → ${to}`);
    }
    const ts = now();
    db()
      .prepare(
        "UPDATE data_factory_records SET verification_status = ?, pipeline_updated_at = ?, updated_at = ? WHERE id = ?",
      )
      .run(to, ts, ts, id);
    return this.get(id)!;
  },

  bulk(ids: string[], action: "approve" | "reject" | "tag", value?: string): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");

    if (action === "approve") {
      const result = db()
        .prepare(
          `UPDATE data_factory_records SET verification_status = 'APPROVED', updated_at = ?
           WHERE id IN (${placeholders})`,
        )
        .run(now(), ...ids);
      return result.changes;
    }
    if (action === "reject") {
      const result = db()
        .prepare(
          `UPDATE data_factory_records SET verification_status = 'REJECTED', updated_at = ?
           WHERE id IN (${placeholders})`,
        )
        .run(now(), ...ids);
      return result.changes;
    }
    // action === "tag"
    if (!value) return 0;
    const rows = db()
      .prepare(`SELECT id, tags FROM data_factory_records WHERE id IN (${placeholders})`)
      .all(...ids) as { id: string; tags: string }[];

    const ts = now();
    const updateStmt = db().prepare("UPDATE data_factory_records SET tags = ?, updated_at = ? WHERE id = ?");
    let count = 0;
    for (const row of rows) {
      const tags: string[] = safeJsonParse(row.tags, []);
      if (!tags.includes(value!)) {
        tags.push(value!);
        updateStmt.run(JSON.stringify(tags), ts, row.id);
        count++;
      }
    }
    return count;
  },

  setValidation(id: string, results: ValidationResult[]): void {
    db()
      .prepare("UPDATE data_factory_records SET validation_results = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(results), now(), id);
  },

  /** Returns all records of a given status (for dataset assembly / export). */
  listByStatus(status: VerificationStatus): DataFactoryRecord[] {
    const rows = db()
      .prepare("SELECT * FROM data_factory_records WHERE verification_status = ? ORDER BY created_at ASC")
      .all(status) as DataFactoryRow[];
    return rows.map(rowToRecord);
  },

  /** Returns all records (for export). */
  listAll(): DataFactoryRecord[] {
    const rows = db().prepare("SELECT * FROM data_factory_records ORDER BY created_at DESC").all() as DataFactoryRow[];
    return rows.map(rowToRecord);
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM data_factory_records WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
