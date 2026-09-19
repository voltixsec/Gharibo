/**
 * ACCEPTANCE: automated verification must never touch the user's real database.
 *
 *   A. snapshot the real DB (ids + titles + message count + file size)
 *   B. run a MUTATING suite against an isolated temp-DB server
 *   C. confirm the test conversations exist in the TEMPORARY database
 *   D. stop the isolated server (temp DB removed)
 *   E. confirm the REAL database is unchanged with ZERO test conversations added
 *
 * Also proves the guard works: a mutating suite pointed at a non-isolated server
 * must REFUSE (exit 2) rather than write.
 *
 * The real DB is opened READ-ONLY and is never written, copied or restored.
 *
 * Usage: node tools/verification/verification-db-isolation.mjs [suite.mjs]
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { startIsolatedPlayground } from "./lib/isolated-playground-server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_DB = "C:/Dev/GHARIBO/apps/web/data/gharibo.db";
const SUITE = process.argv[2] ?? "sidebar-features.mjs";
const MARKER = "__isolation_probe__";

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** Reads the logical state of a database WITHOUT writing to it. */
function snapshot(dbPath) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const convs = db.prepare("SELECT id, title FROM conversations ORDER BY id").all();
    const messages = db.prepare("SELECT COUNT(*) AS n FROM messages").get();
    const hash = crypto
      .createHash("sha256")
      .update(JSON.stringify(convs) + "|" + messages.n)
      .digest("hex");
    return {
      count: convs.length,
      messages: messages.n,
      hash,
      ids: convs.map((c) => c.id),
      hasMarker: convs.some((c) => (c.title || "").includes(MARKER)),
      size: fs.statSync(dbPath).size,
    };
  } finally {
    db.close();
  }
}

function countIn(dbPath, marker) {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    return db
      .prepare("SELECT COUNT(*) AS n FROM conversations WHERE title LIKE ?")
      .get(`%${marker}%`).n;
  } finally {
    db.close();
  }
}

console.log("=== A. snapshot the REAL database (read-only) ===");
const before = snapshot(REAL_DB);
console.log(
  `   conversations=${before.count} messages=${before.messages} size=${before.size} hash=${before.hash.slice(0, 16)}`,
);
check("A: the real database is readable before the run", before.count >= 0, `${before.count} conversations`);

// ---------------------------------------------------------------- guard proof
console.log("\n=== GUARD: a mutating suite must refuse a non-isolated server ===");
const guardCode = await new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(HERE, SUITE), "http://127.0.0.1:3100"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GHARIBO_ISOLATED_VERIFICATION: "" },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (out += String(d)));
  child.once("exit", (c) => resolve({ code: c ?? 1, out }));
});
check(
  "GUARD: running without the isolated runner is refused (exit 2)",
  guardCode.code === 2,
  `exit=${guardCode.code}`,
);

// ---------------------------------------------------------------- B/C
console.log(`\n=== B. run mutating suite '${SUITE}' against an ISOLATED server ===`);
const server = await startIsolatedPlayground({ label: "db-isolation" });
console.log(`   isolated server: ${server.baseUrl}`);
console.log(`   temp DB        : ${server.dbPath}`);

// Create marker conversations through the isolated server's own API.
let createdIds = [];
for (let i = 0; i < 2; i += 1) {
  const res = await fetch(`${server.baseUrl}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `${MARKER} ${i}`,
      providerId: null,
      modelId: "GHARIBO-V1",
    }),
  });
  const json = await res.json().catch(() => null);
  if (json?.data?.id) createdIds.push(json.data.id);
}
check("B: marker conversations were created via the isolated server", createdIds.length === 2, createdIds.length + " created");

let inTemp = 0;
if (fs.existsSync(server.dbPath)) {
  inTemp = countIn(server.dbPath, MARKER);
}
check(
  "C: those conversations exist in the TEMPORARY database",
  inTemp === 2,
  `temp DB matches=${inTemp}`,
);

// Run the real mutating suite too, so this is not just an API smoke check.
const suiteCode = await new Promise((resolve) => {
  const child = spawn(process.execPath, [path.join(HERE, SUITE), server.baseUrl], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GHARIBO_ISOLATED_VERIFICATION: "1" },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += String(d)));
  child.stderr.on("data", (d) => (out += String(d)));
  child.once("exit", (c) => resolve({ code: c ?? 1, out }));
});
const suiteTail = (suiteCode.out || "").trim().split("\n").filter(Boolean).slice(-1)[0] ?? "";
check(
  `B: mutating suite '${SUITE}' passed against the isolated server`,
  suiteCode.code === 0,
  suiteTail,
);

// ---------------------------------------------------------------- D/E
console.log("\n=== D. stop the isolated server ===");
await server.stop();
check("D: the temporary database directory was removed", !fs.existsSync(server.dir), server.dir);

console.log("\n=== E. the REAL database must be unchanged ===");
const after = snapshot(REAL_DB);
console.log(
  `   conversations=${after.count} messages=${after.messages} size=${after.size} hash=${after.hash.slice(0, 16)}`,
);
check("E: conversation count unchanged", after.count === before.count, `${before.count} -> ${after.count}`);
check("E: message count unchanged", after.messages === before.messages, `${before.messages} -> ${after.messages}`);
check("E: logical hash unchanged", after.hash === before.hash, `${before.hash.slice(0, 16)} vs ${after.hash.slice(0, 16)}`);
check("E: ZERO test conversations entered the real DB", after.hasMarker === false, `hasMarker=${after.hasMarker}`);
check(
  "E: no isolated-run id appears in the real DB",
  createdIds.every((id) => !after.ids.includes(id)),
  `${createdIds.length} ids checked`,
);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} DB-isolation acceptance checks passed`);
if (failed.length) for (const f of failed) console.log(`  ${f.name}  ${f.detail ?? ""}`);
process.exit(failed.length === 0 ? 0 : 1);
