/**
 * Providers repository — CRUD + listActive.
 * Maps SQLite rows (snake_case) ↔ ProviderConfig domain objects (camelCase).
 */
import { db } from "@/lib/db/index";
import type { ProviderConfig, ProviderType } from "@gharibo/shared";
import { genId, now } from "@/lib/utils";
import { safeJsonParse } from "@/lib/utils";

/** Raw SQLite row shape. */
interface ProviderRow {
  id: string;
  provider: string;
  model_id: string;
  base_url: string;
  api_key_ref: string | null;
  context_window: number;
  supports_vision: number;
  supports_tools: number;
  supports_structured_output: number;
  supports_reasoning: number;
  display_name: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/** Maps a SQLite row to a ProviderConfig domain object. */
function rowToConfig(row: ProviderRow): ProviderConfig {
  return {
    id: row.id,
    provider: row.provider as ProviderType,
    modelId: row.model_id,
    baseUrl: row.base_url,
    apiKeyRef: row.api_key_ref,
    contextWindow: row.context_window,
    supportsVision: row.supports_vision === 1,
    supportsTools: row.supports_tools === 1,
    supportsStructuredOutput: row.supports_structured_output === 1,
    supportsReasoning: row.supports_reasoning === 1,
    displayName: row.display_name ?? undefined,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const providersRepository = {
  /** Lists all providers. */
  list(): ProviderConfig[] {
    const rows = db().prepare("SELECT * FROM providers ORDER BY created_at DESC").all() as ProviderRow[];
    return rows.map(rowToConfig);
  },

  /** Lists only active providers. */
  listActive(): ProviderConfig[] {
    const rows = db()
      .prepare("SELECT * FROM providers WHERE is_active = 1 ORDER BY created_at DESC")
      .all() as ProviderRow[];
    return rows.map(rowToConfig);
  },

  /** Gets a single provider by ID. */
  get(id: string): ProviderConfig | null {
    const row = db().prepare("SELECT * FROM providers WHERE id = ?").get(id) as ProviderRow | undefined;
    return row ? rowToConfig(row) : null;
  },

  /** Creates a new provider. */
  create(input: Omit<ProviderConfig, "id" | "createdAt" | "updatedAt">): ProviderConfig {
    const id = genId();
    const ts = now();
    db()
      .prepare(
        `INSERT INTO providers (id, provider, model_id, base_url, api_key_ref, context_window,
         supports_vision, supports_tools, supports_structured_output, supports_reasoning,
         display_name, is_active, created_at, updated_at)
         VALUES (@id, @provider, @model_id, @base_url, @api_key_ref, @context_window,
         @supports_vision, @supports_tools, @supports_structured_output, @supports_reasoning,
         @display_name, @is_active, @created_at, @updated_at)`,
      )
      .run({
        id,
        provider: input.provider,
        model_id: input.modelId,
        base_url: input.baseUrl,
        api_key_ref: input.apiKeyRef,
        context_window: input.contextWindow,
        supports_vision: input.supportsVision ? 1 : 0,
        supports_tools: input.supportsTools ? 1 : 0,
        supports_structured_output: input.supportsStructuredOutput ? 1 : 0,
        supports_reasoning: input.supportsReasoning ? 1 : 0,
        display_name: input.displayName ?? null,
        is_active: input.isActive ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      });
    return this.get(id)!;
  },

  /** Updates a provider (partial). */
  update(id: string, patch: Partial<ProviderConfig>): ProviderConfig | null {
    const current = this.get(id);
    if (!current) return null;
    const updated: ProviderConfig = { ...current, ...patch, id, updatedAt: now() };
    db()
      .prepare(
        `UPDATE providers SET provider = ?, model_id = ?, base_url = ?, api_key_ref = ?,
         context_window = ?, supports_vision = ?, supports_tools = ?, supports_structured_output = ?,
         supports_reasoning = ?, display_name = ?, is_active = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        updated.provider,
        updated.modelId,
        updated.baseUrl,
        updated.apiKeyRef,
        updated.contextWindow,
        updated.supportsVision ? 1 : 0,
        updated.supportsTools ? 1 : 0,
        updated.supportsStructuredOutput ? 1 : 0,
        updated.supportsReasoning ? 1 : 0,
        updated.displayName ?? null,
        updated.isActive ? 1 : 0,
        updated.updatedAt,
        id,
      );
    return this.get(id);
  },

  /** Deletes a provider. */
  remove(id: string): boolean {
    const result = db().prepare("DELETE FROM providers WHERE id = ?").run(id);
    return result.changes > 0;
  },
};
