/**
 * Runs a mutating verification suite against a THROWAWAY Playground server.
 *
 *   node tools/verification/run-isolated.mjs e2e.mjs [extra args...]
 *
 * The suite receives the isolated base URL as its first argument, and
 * GHARIBO_ISOLATED_VERIFICATION=1 so its guard is satisfied. Everything it
 * creates lands in a temp SQLite file that is deleted on exit.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startIsolatedPlayground } from "./lib/isolated-playground-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const suite = process.argv[2];
const extra = process.argv.slice(3);

if (!suite) {
  console.error("Usage: node run-isolated.mjs <suite.mjs> [args...]");
  process.exit(2);
}

const label = suite.replace(/\.mjs$/, "").replace(/[^a-z0-9]/gi, "-");
const server = await startIsolatedPlayground({ label });
console.log(`[isolated] server  : ${server.baseUrl}`);
console.log(`[isolated] temp DB : ${server.dbPath}\n`);

const code = await new Promise((resolve) => {
  const child = spawn(
    process.execPath,
    [path.join(HERE, suite), server.baseUrl, ...extra],
    {
      stdio: "inherit",
      env: { ...process.env, GHARIBO_ISOLATED_VERIFICATION: "1" },
    },
  );
  child.once("exit", (c) => resolve(c ?? 1));
});

await server.stop();
console.log(`\n[isolated] stopped and removed ${server.dbPath}`);
process.exit(code);
