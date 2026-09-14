/**
 * SQLite database singleton connection.
 * Uses better-sqlite3 with WAL mode for concurrent reads during streaming.
 * The database file persists at DATABASE_PATH (default ./data/gharibo.db).
 */
import Database from "better-sqlite3";
import { config } from "@/lib/config";
import { runMigrations } from "@/lib/db/migrate";
import path from "path";
import fs from "fs";

let _db: Database.Database | null = null;

/**
 * Returns the singleton better-sqlite3 database connection.
 * Creates the connection on first call, enables WAL mode,
 * and runs migrations (idempotent CREATE TABLE IF NOT EXISTS).
 */
export function db(): Database.Database {
  if (_db) return _db;

  // Resolve the database path relative to the project root.
  const dbPath = resolveDbPath();

  // Ensure parent directory exists.
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run migrations on first connection.
  runMigrations(_db);

  return _db;
}

/**
 * Resolves the database file path.
 * Handles relative paths from apps/web working directory.
 */
function resolveDbPath(): string {
  const p = config.databasePath;
  // If it's already absolute, use as-is.
  if (path.isAbsolute(p)) return p;
  // Resolve relative to the apps/web directory (where next runs from).
  return path.resolve(process.cwd(), p);
}

/** Closes the database connection (for testing / graceful shutdown). */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
