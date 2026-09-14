/**
 * Server-side configuration.
 * Reads environment variables and provides a typed Config object.
 * Never expose secrets to the client.
 */

function env(key: string, fallback: string = ""): string {
  if (typeof process === "undefined") return fallback;
  return process.env[key] ?? fallback;
}

export interface AppConfig {
  databasePath: string;
  trainerUrl: string;
  inferenceUrl: string;
  researchUrl: string;
  /** Allowed root directories for filesystem operations. */
  allowedDirs: string[];
}

/** Resolved application configuration. */
export const config: AppConfig = {
  databasePath: env("DATABASE_PATH", "./data/gharibo.db"),
  trainerUrl: env("TRAINER_URL", "http://127.0.0.1:8100"),
  inferenceUrl: env("INFERENCE_URL", "http://127.0.0.1:8101"),
  researchUrl: env("RESEARCH_URL", "http://127.0.0.1:8102"),
  allowedDirs: ["./data", "./models"],
};

/**
 * Validates that a path is within an allowed directory root.
 * @throws Error if the path is outside allowed roots.
 */
export function validatePath(path: string): void {
  const normalized = path.replace(/\\/g, "/");
  const isAllowed = config.allowedDirs.some((dir) => {
    const normalizedDir = dir.replace(/\\/g, "/");
    return normalized.startsWith(normalizedDir) || normalized.startsWith("." + normalizedDir);
  });
  if (!isAllowed) {
    throw new Error(`Path outside allowed directories: ${path}`);
  }
}
