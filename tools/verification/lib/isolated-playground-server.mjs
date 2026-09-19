/**
 * Isolated Playground server for mutating verification suites.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several verification suites CREATE, PATCH and DELETE conversations. Pointed at
 * the owner's normal local server, they would do that inside
 * `apps/web/data/gharibo.db` — the real user database. Cleaning up afterwards is
 * not isolation: rows were really written, IDs really churned, and a crash
 * mid-suite would leave junk behind.
 *
 * This helper guarantees isolation by construction:
 *   1. a fresh OS temp directory per run;
 *   2. a dedicated SQLite file inside it;
 *   3. a Next.js server started with DATABASE_PATH pointed at that file ONLY;
 *   4. teardown that stops the server and deletes the temp DB (and WAL/SHM).
 *
 * The user's real database is never read, copied, restored or written.
 *
 * Usage:
 *   const server = await startIsolatedPlayground();
 *   // run a suite against server.baseUrl
 *   await server.stop();
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const REPO_ROOT = "C:/Dev/GHARIBO";
const WEB_DIR = path.join(REPO_ROOT, "apps/web");

/** Prepends the Node directory so `npx` resolves even under a bare environment. */
function withNodeOnPath() {
  const nodeDir = "C:\\Program Files\\nodejs";
  const existing = process.env.PATH || "";
  return existing.includes(nodeDir) ? existing : `${nodeDir};${existing}`;
}

/** Waits until the isolated server answers on /playground. */
async function waitForServer(port, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/playground`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await sleep(1000);
  }
  return false;
}

/**
 * Starts a throwaway Playground server backed by a throwaway database.
 *
 * @param {object} [options]
 * @param {string} [options.label] name used in the temp directory (debuggability)
 * @param {number} [options.port] fixed port; a random-ish one is chosen otherwise
 */
export async function startIsolatedPlayground(options = {}) {
  const label = options.label ?? "run";
  const port = options.port ?? 3300 + Math.floor(Math.random() * 400);

  // 1. Fresh temp directory + dedicated DB path.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gharibo-verification-${label}-`));
  const dbPath = path.join(dir, "gharibo-test.db");

  // 2. Start the server with ONLY this database.
  //
  //    Next's bin is invoked through `node` directly rather than `npx`: on
  //    Windows `npx` is a .cmd shim that `spawn` cannot resolve without a shell
  //    (ENOENT), and adding a shell adds quoting problems we do not need.
  const nextBin = path.join(REPO_ROOT, "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: WEB_DIR,
    env: {
      ...process.env,
      PATH: withNodeOnPath(),
      DATABASE_PATH: dbPath,
      // Belt and braces: if a suite somehow reads this, it sees a temp DB.
      GHARIBO_VERIFICATION_ISOLATED: "1",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  child.stderr?.on("data", (d) => {
    stderr += String(d);
    if (stderr.length > 8000) stderr = stderr.slice(-8000);
  });
  child.stdout?.on("data", () => {
    /* progress output is intentionally not captured in full */
  });

  const up = await waitForServer(port);
  if (up && options.seedProviders !== false) {
    /*
     * A fresh temp DB has NO providers, so any suite that exercises provider
     * routing would find nothing to test. Seed one synthetic row — into the TEMP
     * database only. The user's provider configuration is never read or copied.
     */
    try {
      await fetch(`http://127.0.0.1:${port}/api/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "ollama",
          modelId: "llama3.2",
          baseUrl: "http://localhost:11434",
          contextWindow: 8192,
          displayName: "Isolated Verification Provider",
          isActive: true,
        }),
      });
    } catch {
      /* seeding is best-effort; suites that need a provider will report it */
    }
  }
  if (!up) {
    try {
      child.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    throw new Error(
      `isolated Playground failed to start on port ${port}\n${stderr.slice(-1500)}`,
    );
  }

  let stopped = false;

  return {
    port,
    dbPath,
    dir,
    baseUrl: `http://127.0.0.1:${port}`,

    /** True when the temporary DB file (or its WAL) exists. */
    hasDb() {
      return (
        fs.existsSync(dbPath) ||
        fs.existsSync(`${dbPath}-wal`) ||
        fs.existsSync(`${dbPath}-shm`)
      );
    },

    /** Stops the server and removes the temporary database directory. */
    async stop() {
      if (stopped) return;
      stopped = true;

      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          try {
            child.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 8000);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
        try {
          child.kill("SIGTERM");
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });

      // Remove the temp DB (and WAL/SHM) — never touches the user's database.
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}
