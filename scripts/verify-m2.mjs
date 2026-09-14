#!/usr/bin/env node
/**
 * verify-m2.mjs — Milestone 2 metric verifier.
 *
 * Recomputes the five `docs:facts` metrics from the real source tree:
 *   - api_route_files   : files matching apps/web/app/api/**\/route.ts
 *   - api_handlers      : exported GET/POST/PUT/PATCH/DELETE handlers across them
 *   - sqlite_tables     : `CREATE TABLE IF NOT EXISTS <name> (` in apps/web/lib/db/schema.ts
 *   - dashboard_pages   : page.tsx files under apps/web/app/(dashboard)
 *   - adrs              : docs/adr/ADR-*.md files
 *
 * Default mode is informational (exit 0). Pass `--check` to compare against the
 * `<!-- docs:facts -->` block in docs/ARCHITECTURE.md and exit 1 on any mismatch.
 *
 * Run: node scripts/verify-m2.mjs [--check]
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const p = (...parts) => join(ROOT, ...parts);
const rel = (abs) => relative(ROOT, abs).split(sep).join("/");

function walk(dir, filter) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

const routeFiles = walk(p("apps", "web", "app", "api"), (f) => f.endsWith("route.ts"));
const handlerRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g;
let handlers = 0;
for (const f of routeFiles) handlers += (readFileSync(f, "utf8").match(handlerRe) || []).length;

const schema = readFileSync(p("apps", "web", "lib", "db", "schema.ts"), "utf8");
const tables = (schema.match(/CREATE TABLE IF NOT EXISTS\s+[a-z_]+\s*\(/g) || []).length;

const pages = walk(p("apps", "web", "app", "(dashboard)"), (f) => f.endsWith("page.tsx"));
const adrs = walk(p("docs", "adr"), (f) => /ADR-\d{4}-.*\.md$/.test(f));

const actual = {
  api_route_files: routeFiles.length,
  api_handlers: handlers,
  sqlite_tables: tables,
  dashboard_pages: pages.length,
  adrs: adrs.length,
};

const line = "─".repeat(64);
console.log(line);
console.log("GHARIBO AI LAB — Milestone 2 metric verification");
console.log(line);
for (const [k, v] of Object.entries(actual)) {
  console.log(`  ${k.padEnd(18)} ${v}`);
}
console.log(line);

// Optional strict comparison against the docs:facts block (lead-owned).
const archPath = p("docs", "ARCHITECTURE.md");
let mismatches = 0;
if (existsSync(archPath)) {
  const block = readFileSync(archPath, "utf8").match(
    /<!--\s*docs:facts\s*-->([\s\S]*?)<!--\s*\/docs:facts\s*-->/,
  );
  if (block) {
    const declared = {};
    for (const l of block[1].split(/\r?\n/)) {
      const m = l.match(/^\|\s*([a-z_]+)\s*\|\s*([0-9]+)\s*\|\s*$/);
      if (m) declared[m[1]] = Number(m[2]);
    }
    for (const [k, v] of Object.entries(actual)) {
      if (k in declared && declared[k] !== v) {
        console.log(`  MISMATCH  ${k}: docs:facts says ${declared[k]}, actual ${v}`);
        mismatches++;
      }
    }
    if (mismatches === 0) {
      console.log("  docs:facts block matches the source tree.");
    }
  } else {
    console.log("  (no docs:facts block found in docs/ARCHITECTURE.md)");
  }
}

const check = process.argv.includes("--check");
if (check && mismatches > 0) {
  console.log(`RESULT: FAILED — ${mismatches} metric mismatch(es).`);
  process.exit(1);
}
console.log("RESULT: metrics computed successfully.");
