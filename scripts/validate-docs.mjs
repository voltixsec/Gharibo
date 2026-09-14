#!/usr/bin/env node
/**
 * validate-docs.mjs — documentation governance validator for GHARIBO AI LAB.
 *
 * Enforces the rules in docs/DOCUMENTATION_GOVERNANCE.md:
 *   1. Every governed document carries a complete metadata header.
 *   2. Every Status is in the vocabulary for its document type.
 *   3. ADR files are correctly named/numbered and the index matches the files on disk.
 *   4. Every fact declared in the `docs:facts` block matches the implementation.
 *   5. Every version/status in docs/DOCUMENT_REGISTER.md matches the document itself.
 *
 * Run: npm run docs:validate
 * Exit code 0 = all checks passed; 1 = at least one failure.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOC_STATUSES = ['Draft', 'In Review', 'Approved', 'Frozen', 'Living', 'Superseded', 'Deprecated'];
const ADR_STATUSES = ['Proposed', 'Accepted', 'Rejected', 'Superseded', 'Deprecated'];

const failures = [];
const checks = [];

const fail = (check, msg) => failures.push(`[${check}] ${msg}`);
const pass = (check, msg) => checks.push(`[${check}] ${msg}`);
const p = (...parts) => join(ROOT, ...parts);

function read(rel) {
  return readFileSync(p(rel), 'utf8');
}

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

const relOf = (abs) => relative(ROOT, abs).split(sep).join('/');

/** Parse a markdown metadata table row of the form `| **Key** | Value |`. */
function parseMdMeta(text) {
  const meta = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\|\s*\*\*([^*]+)\*\*\s*\|\s*(.+?)\s*\|\s*$/);
    if (m) {
      const key = m[1].trim();
      if (!(key in meta)) meta[key] = m[2].trim();
    }
  }
  return meta;
}

/** Parse `%% Key: Value` metadata comments from a mermaid file. */
function parseMermaidMeta(text) {
  const meta = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*%%\s*([A-Za-z ]+):\s*(.+?)\s*$/);
    if (m) {
      const key = m[1].trim();
      if (!(key in meta)) meta[key] = m[2].trim();
    }
  }
  return meta;
}

// ---------------------------------------------------------------- 1. metadata
const isAdrFile = (f) => /ADR-\d{4}-/.test(f);

// Root-level documents that are part of the governed set (repo root, not under docs/).
const ROOT_DOCS = ['README.md', 'overview.md', 'PROJECT_STATE.md', 'CHANGELOG.md'];

const mdDocs = [
  ...walk(p('docs'), (f) => f.endsWith('.md')),
  ...ROOT_DOCS.map((f) => p(f)),
].filter(existsSync);

const REQUIRED_DOC_FIELDS = ['Document Owner', 'Type', 'Status', 'Version', 'Last Updated'];

for (const abs of mdDocs) {
  const rel = relOf(abs);
  const text = readFileSync(abs, 'utf8');
  const meta = parseMdMeta(text);

  if (isAdrFile(rel)) {
    if (!meta.Status) fail('metadata', `${rel}: missing **Status**`);
    else if (!ADR_STATUSES.includes(meta.Status))
      fail('metadata', `${rel}: Status "${meta.Status}" not in ${ADR_STATUSES.join(' | ')}`);
    if (!meta.Date) fail('metadata', `${rel}: missing **Date**`);
    continue;
  }

  const missing = REQUIRED_DOC_FIELDS.filter((k) => !meta[k]);
  if (missing.length) {
    fail('metadata', `${rel}: missing field(s): ${missing.join(', ')}`);
    continue;
  }
  if (!DOC_STATUSES.includes(meta.Status))
    fail('metadata', `${rel}: Status "${meta.Status}" not in ${DOC_STATUSES.join(' | ')}`);
  if (!/^\d+\.\d+\.\d+$/.test(meta.Version))
    fail('metadata', `${rel}: Version "${meta.Version}" is not semver (X.Y.Z)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta['Last Updated']))
    fail('metadata', `${rel}: Last Updated "${meta['Last Updated']}" is not YYYY-MM-DD`);
}

const mermaidDocs = walk(p('docs'), (f) => f.endsWith('.mermaid'));
for (const abs of mermaidDocs) {
  const rel = relOf(abs);
  const meta = parseMermaidMeta(readFileSync(abs, 'utf8'));
  const missing = REQUIRED_DOC_FIELDS.filter((k) => !meta[k]);
  if (missing.length) fail('metadata', `${rel}: missing %% comment(s): ${missing.join(', ')}`);
  else if (!DOC_STATUSES.includes(meta.Status))
    fail('metadata', `${rel}: Status "${meta.Status}" not in ${DOC_STATUSES.join(' | ')}`);
}
if (!failures.some((f) => f.includes('.mermaid')))
  pass('metadata', `${mdDocs.length} markdown + ${mermaidDocs.length} diagram document(s) have valid metadata`);

// ---------------------------------------------------------------- 2. ADRs
const adrDir = p('docs', 'adr');
const adrFiles = walk(adrDir, (f) => /ADR-\d{4}-.*\.md$/.test(f))
  .map((f) => relOf(f))
  .sort();

const numbers = adrFiles.map((f) => Number(f.match(/ADR-(\d{4})-/)[1]));
for (let i = 0; i < numbers.length; i++) {
  if (numbers[i] !== i + 1) {
    fail('adr', `ADR numbering is not sequential: expected ADR-${String(i + 1).padStart(4, '0')}, found ADR-${String(numbers[i]).padStart(4, '0')}`);
    break;
  }
}
if (numbers.length === new Set(numbers).size) pass('adr', `${adrFiles.length} ADR file(s), numbered 0001..${String(numbers.length).padStart(4, '0')}`);

// index parity
const adrIndexPath = 'docs/adr/README.md';
const indexPath = p(adrIndexPath);
if (!existsSync(indexPath)) {
  fail('adr', `${adrIndexPath} not found`);
} else {
  const indexText = readFileSync(indexPath, 'utf8');
  const linked = [...indexText.matchAll(/\]\((ADR-\d{4}-[^)]+\.md)\)/g)].map((m) => `docs/adr/${m[1]}`).sort();
  const missingFromIndex = adrFiles.filter((f) => !linked.includes(f));
  const extraInIndex = linked.filter((f) => !adrFiles.includes(f));
  if (missingFromIndex.length) fail('adr', `ADR file(s) missing from index: ${missingFromIndex.join(', ')}`);
  if (extraInIndex.length) fail('adr', `index links non-existent ADR(s): ${extraInIndex.join(', ')}`);
  if (!missingFromIndex.length && !extraInIndex.length) pass('adr', `index lists exactly the ${adrFiles.length} ADR file(s) on disk`);
}

// ---------------------------------------------------------------- 3. facts
const archPath = p('docs', 'ARCHITECTURE.md');
const factsBlock = readFileSync(archPath, 'utf8').match(/<!--\s*docs:facts\s*-->([\s\S]*?)<!--\s*\/docs:facts\s*-->/);
if (!factsBlock) {
  fail('facts', 'docs/ARCHITECTURE.md has no <!-- docs:facts --> block');
} else {
  const declared = {};
  for (const line of factsBlock[1].split(/\r?\n/)) {
    const m = line.match(/^\|\s*([a-z_]+)\s*\|\s*([0-9]+)\s*\|\s*$/);
    if (m) declared[m[1]] = Number(m[2]);
  }

  const routeFiles = walk(p('apps', 'web', 'app', 'api'), (f) => f.endsWith('route.ts'));
  const handlerRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g;
  let handlers = 0;
  for (const f of routeFiles) handlers += (readFileSync(f, 'utf8').match(handlerRe) || []).length;

  const schema = readFileSync(p('apps', 'web', 'lib', 'db', 'schema.ts'), 'utf8');
  // Count real DDL only: `CREATE TABLE IF NOT EXISTS <name> (`. The trailing paren
  // excludes prose in comments that merely mentions the phrase (e.g. a header comment).
  const tables = (schema.match(/CREATE TABLE IF NOT EXISTS\s+[a-z_]+\s*\(/g) || []).length;

  const pages = walk(p('apps', 'web', 'app', '(dashboard)'), (f) => f.endsWith('page.tsx'));

  const actual = {
    api_route_files: routeFiles.length,
    api_handlers: handlers,
    sqlite_tables: tables,
    dashboard_pages: pages.length,
    adrs: adrFiles.length,
  };

  for (const [key, value] of Object.entries(declared)) {
    if (!(key in actual)) {
      fail('facts', `unknown fact "${key}" declared in docs:facts block`);
    } else if (actual[key] !== value) {
      fail('facts', `${key}: declared ${value}, actual ${actual[key]}`);
    }
  }
  for (const key of Object.keys(actual)) {
    if (!(key in declared)) fail('facts', `fact "${key}" is not declared in the docs:facts block`);
  }
  if (!failures.some((f) => f.startsWith('[facts]'))) {
    pass('facts', Object.entries(actual).map(([k, v]) => `${k}=${v}`).join(', '));
  }
}

// ---------------------------------------------------------------- 4. register
const registerPath = p('docs', 'DOCUMENT_REGISTER.md');
if (!existsSync(registerPath)) {
  fail('register', 'docs/DOCUMENT_REGISTER.md not found');
} else {
  const registerText = readFileSync(registerPath, 'utf8');
  const rows = [...registerText.matchAll(/^\|\s*([^|]+?)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$/gm)];
  let compared = 0;
  for (const [, name, rel, , , status, version] of rows) {
    if (!rel.startsWith('docs/') && !ROOT_DOCS.includes(rel)) continue;
    if (!existsSync(p(rel))) {
      fail('register', `${name.trim()}: path "${rel}" does not exist`);
      continue;
    }
    const text = readFileSync(p(rel), 'utf8');
    const meta = rel.endsWith('.mermaid') ? parseMermaidMeta(text) : parseMdMeta(text);
    if (!meta.Status || !meta.Version) continue; // ADR rows are validated by the ADR section
    compared++;
    if (meta.Status !== status.trim())
      fail('register', `${rel}: register says Status "${status.trim()}", document says "${meta.Status}"`);
    if (meta.Version !== version.trim())
      fail('register', `${rel}: register says Version "${version.trim()}", document says "${meta.Version}"`);
  }
  if (!failures.some((f) => f.startsWith('[register]')))
    pass('register', `${compared} document(s) consistent with the register`);
}

// ---------------------------------------------------------------- report
const line = '─'.repeat(64);
console.log(line);
console.log('GHARIBO AI LAB — documentation governance validation');
console.log(line);
for (const c of checks) console.log(`  PASS  ${c}`);
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(line);
if (failures.length) {
  console.log(`RESULT: FAILED — ${failures.length} problem(s).`);
  process.exit(1);
}
console.log('RESULT: PASSED — documentation baseline is consistent.');
