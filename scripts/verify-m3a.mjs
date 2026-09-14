#!/usr/bin/env node
/**
 * verify-m3a.mjs — Milestone 3A gate runner (launcher).
 *
 * Runs the 12 Section I/Section F gates:
 *   1.  dataset integrity validation
 *   2.  split overlap check
 *   3.  deterministic regeneration check
 *   4.  secret scan
 *   5.  Training Package hash reproduction test
 *   6.  source artifact integrity
 *   7.  deterministic dataset regeneration
 *   8.  provenance coverage
 *   9.  notebook generator/render drift
 *   10. documentation facts
 *   11. no fabricated benchmark results
 *   12. Kaggle-dependent gates (PENDING_EXTERNAL_EXECUTION)
 *
 * WHY A LAUNCHER
 *   Every gate exercises the REAL Milestone 2 libraries under `apps/web/lib`
 *   (`@/lib/...`). Those are TypeScript with path aliases, so plain `node`
 *   cannot import them. The gate logic therefore lives in
 *   `scripts/verify-m3a/gates.ts` and is executed through `vite-node`, which
 *   applies the same aliases as `apps/web/vitest.config.ts`. This file supplies
 *   the two things the probe cannot supply for itself:
 *     - the loader (vite-node + the apps/web config),
 *     - a throwaway `DATABASE_PATH`, so the gates never touch
 *       `apps/web/data/gharibo.db`.
 *
 * RESPONSIBILITY SPLIT
 *   `scripts/qualify/check-qualify-harness.mjs` validates the environment
 *   qualification harness artifact. This runner validates the M2
 *   dataset/package pipeline. They are deliberately separate and neither
 *   imports the other's internals.
 *
 * Run: node scripts/verify-m3a.mjs [--check]
 *   FAIL is fatal in every mode (exit 1). NOT_APPLICABLE never fails. `--check`
 *   is accepted for symmetry with `verify-m2.mjs` and is what `verify:all` uses.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const VITE_NODE = path.join(ROOT, "node_modules", "vite-node", "vite-node.mjs");
const CONFIG = path.join("apps", "web", "vitest.config.ts");
const ENTRY = path.join("scripts", "verify-m3a", "gates.ts");

if (!existsSync(VITE_NODE)) {
  console.error(
    "verify:m3a — vite-node was not found at node_modules/vite-node/vite-node.mjs.\n" +
      "Run `npm install` first; the gate probe needs the loader to import the M2 TypeScript libraries.",
  );
  process.exit(1);
}

// A throwaway database, so the gates never open the real one. Set before the
// child starts: `@/lib/config` reads DATABASE_PATH at import time.
const scratch = mkdtempSync(path.join(tmpdir(), "gharibo-m3a-"));
const dbPath = path.join(scratch, "verify-m3a.db");

const args = [
  VITE_NODE,
  "--config",
  CONFIG,
  "--root",
  path.join("apps", "web"),
  ENTRY,
  ...(process.argv.includes("--check") ? ["--check"] : []),
];

let status = 1;
try {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, DATABASE_PATH: dbPath },
  });
  if (result.error) {
    console.error(`verify:m3a — failed to start the gate probe: ${result.error.message}`);
  } else {
    status = result.status ?? 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

process.exit(status);
