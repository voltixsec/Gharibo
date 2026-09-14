/**
 * Research records repository — CRUD.
 * Maps SQLite rows ↔ ResearchRecord domain objects.
 */
import { db } from "@/lib/db/index";
import type { ResearchRecord } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface ResearchRecordRow {
  id: string;
  task: string;
  instructions: string | null;
  input: string | null;
  sources_considered: string;
  source_snippets: string;
  candidate_entities: string;
  generated_records: string;
  validation_failures: string;
  duplicates_found: string;
  corrections: string;
  final_approved_records: string;
  reward_score: number | null;
  model_used: string | null;
  duration: number | null;
  created_at: string;
}

function rowToRecord(row: ResearchRecordRow): ResearchRecord {
  return {
    id: row.id,
    task: row.task,
    instructions: row.instructions,
    input: row.input,
    sourcesConsidered: safeJsonParse(row.sources_considered, []),
    sourceSnippets: safeJsonParse(row.source_snippets, []),
    candidateEntities: safeJsonParse(row.candidate_entities, []),
    generatedRecords: safeJsonParse(row.generated_records, []),
    validationFailures: safeJsonParse(row.validation_failures, []),
    duplicatesFound: safeJsonParse(row.duplicates_found, []),
    corrections: safeJsonParse(row.corrections, []),
    finalApprovedRecords: safeJsonParse(row.final_approved_records, []),
    rewardScore: row.reward_score,
    modelUsed: row.model_used,
    duration: row.duration,
    createdAt: row.created_at,
  };
}

export const researchRepository = {
  list(): ResearchRecord[] {
    const rows = db().prepare("SELECT * FROM research_records ORDER BY created_at DESC").all() as ResearchRecordRow[];
    return rows.map(rowToRecord);
  },

  get(id: string): ResearchRecord | null {
    const row = db().prepare("SELECT * FROM research_records WHERE id = ?").get(id) as ResearchRecordRow | undefined;
    return row ? rowToRecord(row) : null;
  },

  create(input: Omit<ResearchRecord, "id" | "createdAt">): ResearchRecord {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO research_records (id, task, instructions, input, sources_considered,
         source_snippets, candidate_entities, generated_records, validation_failures,
         duplicates_found, corrections, final_approved_records, reward_score, model_used,
         duration, created_at)
         VALUES (@id, @task, @instructions, @input, @sources_considered,
         @source_snippets, @candidate_entities, @generated_records, @validation_failures,
         @duplicates_found, @corrections, @final_approved_records, @reward_score, @model_used,
         @duration, @created_at)`,
      )
      .run({
        id,
        task: input.task,
        instructions: input.instructions,
        input: input.input,
        sources_considered: JSON.stringify(input.sourcesConsidered),
        source_snippets: JSON.stringify(input.sourceSnippets),
        candidate_entities: JSON.stringify(input.candidateEntities),
        generated_records: JSON.stringify(input.generatedRecords),
        validation_failures: JSON.stringify(input.validationFailures),
        duplicates_found: JSON.stringify(input.duplicatesFound),
        corrections: JSON.stringify(input.corrections),
        final_approved_records: JSON.stringify(input.finalApprovedRecords),
        reward_score: input.rewardScore,
        model_used: input.modelUsed,
        duration: input.duration,
        created_at: ts,
      });
    return this.get(id)!;
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM research_records WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
