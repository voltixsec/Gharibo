/**
 * Canonical record serialization → dataset hash (architecture M2 §5.1).
 *
 * JSONL files store CANONICAL lines, so the notebook hashes raw line bytes and
 * never needs to re-canonicalize.
 *
 * - Fixed key order: task_type, domain, language, input, context, expected_output,
 *   chosen_output, reasoning, source, source_url, license, tags.
 * - Values: strings trimmed and NFC-normalized; `null` for absent; `tags` sorted.
 * - Volatile fields (created_at, updated_at, quality_score, DB id) are EXCLUDED.
 * - Dataset hash = sha256( sort(recordLineHash_i).join("\n") ) — order-independent.
 */
import type { DataFactoryRecord } from "@gharibo/shared";
import { sha256Hex } from "./hash";

/** The canonical field order (snake_case) — do not reorder. */
export const CANONICAL_RECORD_FIELDS = [
  "task_type",
  "domain",
  "language",
  "input",
  "context",
  "expected_output",
  "chosen_output",
  "reasoning",
  "source",
  "source_url",
  "license",
  "tags",
] as const;

/** The subset of a record that participates in the training content hash. */
export interface CanonicalRecordInput {
  taskType: string | null;
  domain: string | null;
  language: string | null;
  input: string;
  context: string | null;
  expectedOutput: string | null;
  chosenOutput: string | null;
  reasoning: string | null;
  source: string | null;
  sourceUrl: string | null;
  license: string | null;
  tags: string[];
}

/** Trims and NFC-normalizes a value; returns null for absent (null/undefined). */
export function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.normalize("NFC").trim();
}

/** Builds the canonical record object with keys in the fixed order above. */
export function canonicalRecord(r: CanonicalRecordInput): Record<string, unknown> {
  const tags = (r.tags ?? []).map((t) => t.normalize("NFC").trim()).sort();
  return {
    task_type: normalizeText(r.taskType),
    domain: normalizeText(r.domain),
    language: normalizeText(r.language),
    input: normalizeText(r.input) ?? "",
    context: normalizeText(r.context),
    expected_output: normalizeText(r.expectedOutput),
    chosen_output: normalizeText(r.chosenOutput),
    reasoning: normalizeText(r.reasoning),
    source: normalizeText(r.source),
    source_url: normalizeText(r.sourceUrl),
    license: normalizeText(r.license),
    tags,
  };
}

/** The canonical JSONL line (no whitespace, fixed key order). */
export function canonicalLine(r: CanonicalRecordInput): string {
  return JSON.stringify(canonicalRecord(r));
}

/** sha256 of the canonical line bytes. */
export function recordLineHash(r: CanonicalRecordInput): string {
  return sha256Hex(canonicalLine(r));
}

/**
 * Order-independent dataset hash over canonical lines:
 * sha256( sort( sha256(line_i) ).join("\n") ).
 */
export function datasetHashFromLines(lines: string[]): string {
  const lineHashes = lines.map((line) => sha256Hex(line)).sort();
  return sha256Hex(lineHashes.join("\n"));
}

/**
 * Order-independent split hash: sha256( sort( recordLineHash(r) ).join("\n") ).
 */
export function splitHashFromLineHashes(lineHashes: string[]): string {
  return sha256Hex([...lineHashes].sort().join("\n"));
}

/** Maps a Data Factory record onto the canonical input shape. */
export function toCanonicalInput(record: DataFactoryRecord): CanonicalRecordInput {
  return {
    taskType: record.taskType,
    domain: record.domain,
    language: record.language,
    input: record.input,
    context: record.context,
    expectedOutput: record.expectedOutput,
    chosenOutput: record.chosenOutput,
    reasoning: record.reasoning ?? null,
    source: record.source,
    sourceUrl: record.sourceUrl,
    license: record.license,
    tags: record.tags ?? [],
  };
}
