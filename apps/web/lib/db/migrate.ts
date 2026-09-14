/**
 * Database migrations — runs all CREATE TABLE IF NOT EXISTS statements,
 * adds M2 columns idempotently, and seeds default settings.
 * Called on first connection (idempotent).
 */
import type Database from "better-sqlite3";
import { SCHEMA_STATEMENTS, DEFAULT_SETTINGS } from "@/lib/db/schema";
import { now } from "@/lib/utils";

/**
 * M2 columns added to existing tables (architecture §6.2). SQLite has no
 * `ADD COLUMN IF NOT EXISTS`, so each is applied only when absent.
 * Format: [table, column, full column DDL].
 */
const M2_COLUMNS: Array<[string, string, string]> = [
  // datasets — content-addressed, immutable versions
  ["datasets", "dataset_hash", "dataset_hash TEXT"],
  ["datasets", "dataset_version_id", "dataset_version_id TEXT"],
  ["datasets", "split_policy", "split_policy TEXT NOT NULL DEFAULT '{}'"],
  ["datasets", "split_hashes", "split_hashes TEXT NOT NULL DEFAULT '{}'"],
  ["datasets", "schema_version", "schema_version TEXT NOT NULL DEFAULT '1.0.0'"],
  ["datasets", "status", "status TEXT NOT NULL DEFAULT 'DRAFT'"],
  ["datasets", "parent_dataset_id", "parent_dataset_id TEXT"],

  // data_factory_records — reasoning channel + gold-pipeline audit
  ["data_factory_records", "reasoning", "reasoning TEXT"],
  ["data_factory_records", "pipeline_updated_at", "pipeline_updated_at TEXT"],

  // training_runs — engine values M2 derives from (never hardcoded)
  ["training_runs", "max_seq_length", "max_seq_length INTEGER"],
  ["training_runs", "optimizer", "optimizer TEXT"],
  ["training_runs", "warmup_steps", "warmup_steps INTEGER"],
  ["training_runs", "lr_scheduler_type", "lr_scheduler_type TEXT"],
  ["training_runs", "weight_decay", "weight_decay REAL"],
  ["training_runs", "dtype", "dtype TEXT"],
  ["training_runs", "save_strategy", "save_strategy TEXT"],
  ["training_runs", "save_steps", "save_steps INTEGER"],
  ["training_runs", "save_total_limit", "save_total_limit INTEGER"],
  ["training_runs", "base_model_revision", "base_model_revision TEXT"],
  ["training_runs", "loader_model_id", "loader_model_id TEXT"],
  ["training_runs", "worker_id", "worker_id TEXT"],
  ["training_runs", "package_id", "package_id TEXT"],
  ["training_runs", "resume_from_checkpoint", "resume_from_checkpoint TEXT"],

  // experiments — package + manifest + provenance + real code version
  ["experiments", "package_id", "package_id TEXT"],
  ["experiments", "manifest", "manifest TEXT NOT NULL DEFAULT '{}'"],
  ["experiments", "provenance", "provenance TEXT NOT NULL DEFAULT '{}'"],
];

/** Adds a column only if it is absent (PRAGMA table_info is authoritative). */
function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  ddl: string,
): void {
  const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

/**
 * Runs all schema migrations and seeds default settings.
 * Safe to call multiple times — everything is IF NOT EXISTS / column-guarded.
 */
export function runMigrations(database: Database.Database): void {
  const execAll = database.transaction(() => {
    for (const stmt of SCHEMA_STATEMENTS) {
      database.exec(stmt);
    }

    // Idempotently add M2 columns to existing tables.
    for (const [table, column, ddl] of M2_COLUMNS) {
      ensureColumn(database, table, column, ddl);
    }

    // Seed default settings (only if not already present).
    const insertSetting = database.prepare(
      `INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
    );
    const ts = now();
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      insertSetting.run(key, value, ts);
    }
  });

  execAll();
}

/** Re-export the db accessor for convenience. */
export { db } from "@/lib/db/index";
