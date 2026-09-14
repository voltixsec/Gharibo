/**
 * JSONL (JSON Lines) I/O utilities.
 * Used for data-factory import/export and dataset export.
 */

/** Converts an array of objects to JSONL text. */
export function toJsonl<T extends Record<string, unknown>>(rows: T[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n");
}

/** Parses JSONL text into an array of objects. Returns warnings for malformed lines. */
export function parseJsonl<T = Record<string, unknown>>(text: string): { rows: T[]; warnings: string[] } {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  const rows: T[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const parsed = JSON.parse(lines[i]) as T;
      rows.push(parsed);
    } catch {
      warnings.push(`Line ${i + 1}: Failed to parse JSON — skipped`);
    }
  }

  return { rows, warnings };
}

/** Streams JSONL as a response (text/plain). */
export function jsonlResponse(rows: Record<string, unknown>[], filename: string = "export.jsonl"): Response {
  const text = toJsonl(rows);
  return new Response(text, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
