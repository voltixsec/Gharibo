/**
 * Secrets resolution.
 * API keys are stored as references (env var names) in the DB.
 * This module resolves a reference to the actual env value at call time.
 * The raw key is never logged, never returned to the client.
 */

/**
 * Resolves an API key reference to its actual value from the environment.
 * @param ref - The env var name stored in the DB (e.g. "OPENAI_API_KEY").
 * @returns The actual key value from process.env, or null if not set.
 * @throws Error if the ref contains suspicious characters (security).
 */
export function resolveKeyRef(ref: string | null): string | null {
  if (!ref) return null;

  // Security: only allow alphanumeric + underscore in ref names.
  if (!/^[A-Z][A-Z0-9_]*$/i.test(ref)) {
    throw new Error(`Invalid key reference format: ${ref}`);
  }

  if (typeof process === "undefined") return null;
  return process.env[ref] ?? null;
}

/**
 * Checks whether a key reference has a value set in the environment.
 * @param ref - The env var name.
 * @returns True if the env var is set and non-empty.
 */
export function hasKey(ref: string | null): boolean {
  const value = resolveKeyRef(ref);
  return value !== null && value.length > 0;
}
