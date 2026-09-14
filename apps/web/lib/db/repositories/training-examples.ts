/**
 * Training examples repository — CRUD + approve/reject.
 * Also creates a corresponding data_factory_records row in RAW state.
 */
import { db } from "@/lib/db/index";
import type { TrainingExample, ApprovalState } from "@gharibo/shared";
import { genId, now, safeJsonParse } from "@/lib/utils";

interface TrainingExampleRow {
  id: string;
  prompt: string;
  system_prompt: string | null;
  response: string;
  approved_response: string | null;
  model_id: string | null;
  provider_id: string | null;
  tags: string;
  domain: string | null;
  language: string | null;
  quality_score: number | null;
  approval_state: string;
  source_conversation_id: string | null;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToExample(row: TrainingExampleRow): TrainingExample {
  return {
    id: row.id,
    prompt: row.prompt,
    systemPrompt: row.system_prompt,
    response: row.response,
    approvedResponse: row.approved_response,
    modelId: row.model_id,
    providerId: row.provider_id,
    tags: safeJsonParse(row.tags, []),
    domain: row.domain,
    language: row.language,
    qualityScore: row.quality_score,
    approvalState: row.approval_state as ApprovalState,
    sourceConversationId: row.source_conversation_id,
    sourceMessageId: row.source_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const trainingExamplesRepository = {
  list(approvalState?: ApprovalState): TrainingExample[] {
    const sql = approvalState
      ? "SELECT * FROM training_examples WHERE approval_state = ? ORDER BY created_at DESC"
      : "SELECT * FROM training_examples ORDER BY created_at DESC";
    const rows = (approvalState
      ? db().prepare(sql).all(approvalState)
      : db().prepare(sql).all()) as TrainingExampleRow[];
    return rows.map(rowToExample);
  },

  get(id: string): TrainingExample | null {
    const row = db().prepare("SELECT * FROM training_examples WHERE id = ?").get(id) as TrainingExampleRow | undefined;
    return row ? rowToExample(row) : null;
  },

  create(input: {
    prompt: string;
    systemPrompt?: string | null;
    response: string;
    approvedResponse?: string | null;
    modelId?: string | null;
    providerId?: string | null;
    tags?: string[];
    domain?: string | null;
    language?: string | null;
    qualityScore?: number | null;
    approvalState?: ApprovalState;
    sourceConversationId?: string | null;
    sourceMessageId?: string | null;
  }): TrainingExample {
    const id = genId();
    const ts = now();
    const tags = input.tags ?? [];

    db()
      .prepare(
        `INSERT INTO training_examples (id, prompt, system_prompt, response, approved_response,
         model_id, provider_id, tags, domain, language, quality_score, approval_state,
         source_conversation_id, source_message_id, created_at, updated_at)
         VALUES (@id, @prompt, @system_prompt, @response, @approved_response,
         @model_id, @provider_id, @tags, @domain, @language, @quality_score, @approval_state,
         @source_conversation_id, @source_message_id, @created_at, @updated_at)`,
      )
      .run({
        id,
        prompt: input.prompt,
        system_prompt: input.systemPrompt ?? null,
        response: input.response,
        approved_response: input.approvedResponse ?? null,
        model_id: input.modelId ?? null,
        provider_id: input.providerId ?? null,
        tags: JSON.stringify(tags),
        domain: input.domain ?? null,
        language: input.language ?? null,
        quality_score: input.qualityScore ?? null,
        approval_state: input.approvalState ?? "pending",
        source_conversation_id: input.sourceConversationId ?? null,
        source_message_id: input.sourceMessageId ?? null,
        created_at: ts,
        updated_at: ts,
      });

    // Also create a data_factory_records row in RAW state for the pipeline.
    const dfId = genId();
    db()
      .prepare(
        `INSERT INTO data_factory_records (id, task_type, domain, language, input, context,
         expected_output, chosen_output, rejected_output, source, source_url, license,
         verification_status, quality_score, difficulty, tags, validation_results,
         source_training_example_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 'RAW', ?, ?, ?, '[]', ?, ?, ?)`,
      )
      .run(
        dfId,
        "chat_completion",
        input.domain,
        input.language,
        input.prompt,
        input.systemPrompt,
        input.approvedResponse ?? input.response,
        input.approvedResponse ?? null,
        input.qualityScore,
        null,
        JSON.stringify(tags),
        id,
        ts,
        ts,
      );

    return this.get(id)!;
  },

  update(id: string, patch: {
    approvedResponse?: string | null;
    approvalState?: ApprovalState;
    qualityScore?: number | null;
  }): TrainingExample | null {
    const current = this.get(id);
    if (!current) return null;
    const ts = now();
    const merged = {
      approvedResponse: patch.approvedResponse ?? current.approvedResponse,
      approvalState: patch.approvalState ?? current.approvalState,
      qualityScore: patch.qualityScore ?? current.qualityScore,
    };
    db()
      .prepare(
        `UPDATE training_examples SET approved_response = ?, approval_state = ?, quality_score = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(merged.approvedResponse, merged.approvalState, merged.qualityScore, ts, id);
    return this.get(id);
  },

  approve(id: string, approvedResponse?: string | null): TrainingExample | null {
    return this.update(id, { approvalState: "approved", approvedResponse });
  },

  reject(id: string): TrainingExample | null {
    return this.update(id, { approvalState: "rejected" });
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM training_examples WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
