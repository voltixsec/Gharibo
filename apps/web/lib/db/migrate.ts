/**
 * Database migrations — runs all CREATE TABLE IF NOT EXISTS statements
 * and seeds default settings. Called on first connection (idempotent).
 */
import type Database from "better-sqlite3";
import { SCHEMA_STATEMENTS, DEFAULT_SETTINGS } from "@/lib/db/schema";
import { now } from "@/lib/utils";

/**
 * Runs all schema migrations and seeds default settings.
 * Safe to call multiple times — everything is IF NOT EXISTS.
 */
export function runMigrations(database: Database.Database): void {
  const execAll = database.transaction(() => {
    for (const stmt of SCHEMA_STATEMENTS) {
      database.exec(stmt);
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
