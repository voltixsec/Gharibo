/**
 * SHA-256 hashing helpers (architecture M2 §5).
 *
 * All hashing is SHA-256 over UTF-8 bytes. The notebook reimplements the SAME
 * algorithm in `hashlib` (§9) — this module is the source of truth.
 *
 * Canonical JSON = keys sorted recursively, no whitespace. This is byte-stable and
 * trivially reproducible in Python via `json.dumps(obj, sort_keys=True,
 * separators=(",", ":"))`.
 *
 * Server-only: uses `node:crypto`. Never import from a client component.
 */
import { createHash } from "node:crypto";

/** Returns the lowercase hex SHA-256 of a UTF-8 string. */
export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Returns the lowercase hex SHA-256 of raw bytes. */
export function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** Encodes a string as UTF-8 bytes. */
export function utf8(input: string): Uint8Array {
  return Buffer.from(input, "utf8");
}

/** Recursively sorts object keys so serialization is order-independent. */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortValue(obj[key]);
    }
    return out;
  }
  return value;
}

/** Canonical JSON: recursively sorted keys, no whitespace. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** SHA-256 of the canonical JSON form of a value. */
export function sha256Canonical(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Manifest-of-hashes rollup (§5.3, Q9).
 *
 * rollup = sha256( sort( relative_path + "\t" + fileHash ).join("\n") )
 */
export function artifactRollup(pairs: Array<{ relativePath: string; sha256: string }>): string {
  const lines = pairs
    .map((p) => `${p.relativePath}\t${p.sha256}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256Hex(lines.join("\n"));
}

/** True iff `value` is a 64-char lowercase hex string. */
export function isSha256Hex(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** True iff `value` is a 40-char lowercase hex string. */
export function isGitSha(value: unknown): boolean {
  return typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
}
