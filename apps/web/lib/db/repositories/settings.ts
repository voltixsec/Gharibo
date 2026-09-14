/**
 * Settings repository — key-value get/set.
 */
import { db } from "@/lib/db/index";
import { now } from "@/lib/utils";

interface SettingsRow {
  key: string;
  value: string;
  updated_at: string;
}

export const settingsRepository = {
  /** Gets all settings as a key-value map. */
  list(): Record<string, string> {
    const rows = db().prepare("SELECT key, value FROM settings").all() as SettingsRow[];
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  },

  /** Gets a single setting by key. */
  get(key: string): string | null {
    const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  },

  /** Sets a setting (insert or update). */
  set(key: string, value: string): void {
    const ts = now();
    db()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, ts);
  },

  /** Deletes a setting. */
  remove(key: string): boolean {
    const result = db().prepare("DELETE FROM settings WHERE key = ?").run(key);
    return result.changes > 0;
  },
};
