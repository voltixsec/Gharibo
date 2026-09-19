/**
 * Conversations repository — CRUD + messages.
 * Maps SQLite rows ↔ Conversation / ConversationMessage domain objects.
 */
import { db } from "@/lib/db/index";
import type { Conversation, ConversationMessage, ConversationWithMessages, QualitySignal } from "@gharibo/shared";
import { genId, now } from "@/lib/utils";

interface ConversationRow {
  id: string;
  title: string;
  provider_id: string | null;
  model_id: string | null;
  system_prompt: string | null;
  temperature: number;
  max_tokens: number;
  tools_enabled: number;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  model_id: string | null;
  provider_id: string | null;
  quality_signal: string | null;
  created_at: string;
}

/**
 * Deterministic message ordering.
 *
 * `created_at` has millisecond resolution, and a user turn plus its assistant
 * reply can land inside the same millisecond. Ordering by `created_at` alone is
 * then non-deterministic, which can flip the rendered conversation order (and the
 * order fed back to the model). `rowid` is SQLite's monotonic insertion counter
 * for this table and is the correct tiebreaker.
 */
const MESSAGE_ORDER = "ORDER BY created_at ASC, rowid ASC";

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    providerId: row.provider_id,
    modelId: row.model_id,
    systemPrompt: row.system_prompt,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    toolsEnabled: row.tools_enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow): ConversationMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as "system" | "user" | "assistant",
    content: row.content,
    modelId: row.model_id,
    providerId: row.provider_id,
    qualitySignal: (row.quality_signal as QualitySignal) ?? null,
    createdAt: row.created_at,
  };
}

export const conversationsRepository = {
  list(): Conversation[] {
    const rows = db().prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all() as ConversationRow[];
    return rows.map(rowToConversation);
  },

  get(id: string): ConversationWithMessages | null {
    const row = db().prepare("SELECT * FROM conversations WHERE id = ?").get(id) as ConversationRow | undefined;
    if (!row) return null;
    const msgRows = db()
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ${MESSAGE_ORDER}`)
      .all(id) as MessageRow[];
    return {
      ...rowToConversation(row),
      messages: msgRows.map(rowToMessage),
    };
  },

  create(input: {
    title: string;
    providerId?: string | null;
    modelId?: string | null;
    systemPrompt?: string | null;
    temperature?: number;
    maxTokens?: number;
    toolsEnabled?: boolean;
  }): Conversation {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO conversations (id, title, provider_id, model_id, system_prompt, temperature,
         max_tokens, tools_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.providerId ?? null,
        input.modelId ?? null,
        input.systemPrompt ?? null,
        input.temperature ?? 0.7,
        input.maxTokens ?? 2048,
        input.toolsEnabled ? 1 : 0,
        ts,
        ts,
      );
    return this.get(id) as unknown as Conversation;
  },

  update(id: string, patch: Partial<Conversation>): Conversation | null {
    const current = this.get(id);
    if (!current) return null;
    const ts = now();
    const merged = { ...current, ...patch, id, updatedAt: ts };
    db()
      .prepare(
        `UPDATE conversations SET title = ?, provider_id = ?, model_id = ?, system_prompt = ?,
         temperature = ?, max_tokens = ?, tools_enabled = ?, updated_at = ? WHERE id = ?`,
      )
      .run(
        merged.title,
        merged.providerId,
        merged.modelId,
        merged.systemPrompt,
        merged.temperature,
        merged.maxTokens,
        merged.toolsEnabled ? 1 : 0,
        ts,
        id,
      );
    return this.get(id) as unknown as Conversation;
  },

  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM conversations WHERE id = ?").run(id);
    return result.changes > 0;
  },

  /**
   * Renames a conversation ONLY while it is still untitled.
   *
   * This is the atomic guard behind automatic titling. The decision is made in
   * SQL against the CURRENT persisted value, not against a value the client (or
   * an earlier read in this request) happens to hold:
   *
   *   - two concurrent first-messages cannot both rename;
   *   - a manual rename that landed between our read and our write is preserved;
   *   - a conversation renamed by the user is never auto-renamed again.
   *
   * "Untitled" means the default title or a blank title, so legacy rows that
   * somehow carry an empty string are still eligible.
   *
   * @param id conversation id
   * @param title the derived title
   * @param defaultTitle the value that marks a conversation as untitled
   * @returns true when this call performed the rename
   */
  renameIfUntitled(id: string, title: string, defaultTitle: string): boolean {
    const ts = now();
    const result = db()
      .prepare(
        `UPDATE conversations
            SET title = ?, updated_at = ?
          WHERE id = ?
            AND (title = ? OR TRIM(title) = '')`,
      )
      .run(title, ts, id, defaultTitle);
    return result.changes > 0;
  },

  // Message operations

  addMessage(conversationId: string, input: {
    role: "system" | "user" | "assistant";
    content: string;
    modelId?: string | null;
    providerId?: string | null;
  }): ConversationMessage {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, model_id, provider_id, quality_signal, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, conversationId, input.role, input.content, input.modelId ?? null, input.providerId ?? null, null, ts);

    // Touch conversation updated_at
    db().prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(ts, conversationId);

    const row = db().prepare("SELECT * FROM messages WHERE id = ?").get(id) as MessageRow;
    return rowToMessage(row);
  },

  setMessageQuality(messageId: string, quality: QualitySignal): ConversationMessage | null {
    db()
      .prepare("UPDATE messages SET quality_signal = ? WHERE id = ?")
      .run(quality, messageId);
    const row = db().prepare("SELECT * FROM messages WHERE id = ?").get(messageId) as MessageRow | undefined;
    return row ? rowToMessage(row) : null;
  },

  getMessages(conversationId: string): ConversationMessage[] {
    const rows = db()
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ${MESSAGE_ORDER}`)
      .all(conversationId) as MessageRow[];
    return rows.map(rowToMessage);
  },
};
