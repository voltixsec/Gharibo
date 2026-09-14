/**
 * Evaluations repository — CRUD.
 * Maps SQLite rows ↔ EvaluationResult domain objects.
 */
import { db } from "@/lib/db/index";
import type { EvaluationResult, BenchmarkCategory } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface EvaluationRow {
  id: string;
  model_id: string;
  benchmark_category: string;
  score: number | null;
  base_model_score: number | null;
  regressions: string;
  created_at: string;
}

function rowToResult(row: EvaluationRow): EvaluationResult {
  return {
    id: row.id,
    modelId: row.model_id,
    benchmarkCategory: row.benchmark_category as BenchmarkCategory,
    score: row.score,
    baseModelScore: row.base_model_score,
    regressions: safeJsonParse(row.regressions, []),
    createdAt: row.created_at,
  };
}

export const evaluationsRepository = {
  list(modelId?: string): EvaluationResult[] {
    const sql = modelId
      ? "SELECT * FROM evaluation_results WHERE model_id = ? ORDER BY created_at DESC"
      : "SELECT * FROM evaluation_results ORDER BY created_at DESC";
    const rows = (modelId
      ? db().prepare(sql).all(modelId)
      : db().prepare(sql).all()) as EvaluationRow[];
    return rows.map(rowToResult);
  },

  get(id: string): EvaluationResult | null {
    const row = db().prepare("SELECT * FROM evaluation_results WHERE id = ?").get(id) as EvaluationRow | undefined;
    return row ? rowToResult(row) : null;
  },

  create(input: Omit<EvaluationResult, "id" | "createdAt">): EvaluationResult {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO evaluation_results (id, model_id, benchmark_category, score, base_model_score,
         regressions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.modelId,
        input.benchmarkCategory,
        input.score,
        input.baseModelScore,
        JSON.stringify(input.regressions),
        ts,
      );
    return this.get(id)!;
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM evaluation_results WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
