/**
 * Milestone 3A gate probe — expanded Section I gates.
 *
 * This module is executed by `scripts/verify-m3a.mjs` through `vite-node`, because
 * every gate exercises the REAL Milestone 2 libraries (`@/lib/...`), which are
 * TypeScript and resolve through the `apps/web` vitest aliases. Plain `node`
 * cannot import them; the launcher exists solely to supply that loader plus a
 * throwaway SQLite database path.
 *
 * GATES (13 total)
 *   1.  dataset integrity validation    — content-addressed dataset hash
 *   2.  split overlap check             — deterministic seeded split invariants
 *   3.  deterministic regeneration      — same inputs → same bytes; seed drives the cut
 *   4.  secret scan                     — git-tracked files only
 *   5.  Training Package reproduction   — buildPackageForRun twice → identical bytes
 *   6.  source artifact integrity       — SHA-256 verification of 8 legacy UCL files
 *   7.  deterministic dataset regen     — recompute split hashes, verify no overlap
 *   8.  provenance coverage             — every example links to a source file
 *   9.  notebook generator/render drift — generator output matches committed notebook
 *   10. documentation facts             — docs:validate and verify:m2 --check
 *   11. no fabricated benchmark results — NOT_RUN status, no fake scores
 *   12. Kaggle-dependent gates          — PENDING_EXTERNAL_EXECUTION (real GPU required)
 *   13. qualification safety (static)   — the harness contains no training primitive
 *
 * STATUS TYPES
 *   PASS — gate passed
 *   FAIL — gate failed (fatal, exit 1)
 *   NOT_APPLICABLE — gate is not applicable to the current state
 *   PENDING_EXTERNAL_EXECUTION — gate requires a real Kaggle T4 GPU run (never faked)
 *
 * FIXTURE POLICY
 *   Every fixture-derived value below is synthetic and is labelled
 *   "FIXTURE DATA — not GHARIBO-Research-Gold-v0.1". Real dataset checks
 *   (gates 6-8) now verify the actual GHARIBO-Research-Gold-v0.1 artifacts.
 *
 * EXIT CODE
 *   FAIL is fatal in every mode (exit 1). NOT_APPLICABLE and
 *   PENDING_EXTERNAL_EXECUTION never fail. `--check` is accepted for
 *   symmetry with `verify-m2.mjs` and is what `verify:all` uses.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { canonicalJson, sha256Canonical, sha256Hex } from "@/lib/training/hash";
import {
  CANONICAL_RECORD_FIELDS,
  canonicalLine,
  datasetHashFromLines,
  recordLineHash,
  splitHashFromLineHashes,
  toCanonicalInput,
} from "@/lib/training/canonical";
import { computeSplits, defaultSplitPolicy } from "@/lib/training/split";
import { computePackageIdFromManifest } from "@/lib/training/package";
import { assembleBundleForPackage, buildPackageForRun } from "@/lib/training/export";
import {
  dataFactoryRepository,
  datasetsRepository,
  trainingRunsRepository,
} from "@/lib/db/repositories";
import { closeDb } from "@/lib/db/index";
import { makeRecord, toDataFactoryInput } from "@/lib/__tests__/_m2-fixtures";

// ---------------------------------------------------------------------------
// Report primitives
// ---------------------------------------------------------------------------

type Status = "PASS" | "FAIL" | "NOT_APPLICABLE" | "PENDING_EXTERNAL_EXECUTION";

interface Check {
  name: string;
  status: Status;
  detail: string;
}

interface Gate {
  id: string;
  title: string;
  checks: Check[];
}

const LINE = "─".repeat(64);
const FIXTURE_LABEL = "FIXTURE DATA — not GHARIBO-Research-Gold-v0.1";
const CHECK = process.argv.includes("--check");

function pass(name: string, detail: string): Check {
  return { name, status: "PASS", detail };
}
function fail(name: string, detail: string): Check {
  return { name, status: "FAIL", detail };
}
function na(name: string, detail: string): Check {
  return { name, status: "NOT_APPLICABLE", detail };
}
function pending(name: string, detail: string): Check {
  return { name, status: "PENDING_EXTERNAL_EXECUTION", detail };
}
/** PASS when `ok`, else FAIL. */
function expect(name: string, ok: boolean, detail: string): Check {
  return ok ? pass(name, detail) : fail(name, detail);
}

// ---------------------------------------------------------------------------
// Repo root + fixtures
// ---------------------------------------------------------------------------

/** Resolves the repository root from cwd (the launcher runs from there). */
function findRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, "package.json");
    if (fs.existsSync(pkg)) {
      try {
        if (JSON.parse(fs.readFileSync(pkg, "utf8")).name === "gharibo-ai-lab") return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findRoot();

/** Builds `n` synthetic Data Factory records (fixture data only). */
function fixtureRecords(n: number, tag: string) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(
      makeRecord({
        id: `fixture-${tag}-${i}`,
        input: `FIXTURE ${tag} question ${i}`,
        chosenOutput: `FIXTURE ${tag} answer ${i}`,
        reasoning: null,
        source: "fixture",
        tags: ["fixture", tag],
        verificationStatus: "TRAINING_READY",
      }),
    );
  }
  return out;
}

// ===========================================================================
// Gate 1 — dataset integrity validation
// ===========================================================================

function gateDatasetIntegrity(): Gate {
  const checks: Check[] = [];

  // ---- fixture proof: order-independence of the content address -------------
  const records = fixtureRecords(30, "integrity");
  const lines = records.map((r) => canonicalLine(toCanonicalInput(r)));

  const hOriginal = datasetHashFromLines(lines);
  const hReversed = datasetHashFromLines([...lines].reverse());
  const shuffled = records
    .map((r, i) => ({ r, key: sha256Hex(`perm:${i}`) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map((x) => canonicalLine(toCanonicalInput(x.r)));
  const hShuffled = datasetHashFromLines(shuffled);

  checks.push(
    expect(
      "content-addressed dataset hash is order-independent (original / reversed / shuffled agree)",
      hOriginal === hReversed && hOriginal === hShuffled,
      `${FIXTURE_LABEL} — sha256(original)=${hOriginal.slice(0, 12)}… reversed=${hReversed.slice(
        0,
        12,
      )}… shuffled=${hShuffled.slice(0, 12)}… over 30 fixture records`,
    ),
  );

  // ---- fixture proof: sensitivity to a single field change -----------------
  const mutated = records.map((r, i) =>
    i === 0 ? { ...r, input: `${r.input} [mutated]` } : r,
  );
  const hMutated = datasetHashFromLines(mutated.map((r) => canonicalLine(toCanonicalInput(r))));
  checks.push(
    expect(
      "hash is sensitive to a single field change (one record, one field)",
      hMutated !== hOriginal,
      `${FIXTURE_LABEL} — mutated input of record 0; sha256=${hMutated.slice(0, 12)}… ≠ ${hOriginal.slice(0, 12)}…`,
    ),
  );

  // ---- fixture proof: hashes are valid 64-hex content addresses -------------
  checks.push(
    expect(
      "dataset hash is a 64-char lowercase hex content address",
      /^[0-9a-f]{64}$/.test(hOriginal) && hOriginal === datasetHashFromLines(lines),
      `${FIXTURE_LABEL} — recomputation is stable across calls`,
    ),
  );

  // ---- real artifact: Section B dataset now exists -------------------------
  const datasetCardPath = path.join(ROOT, "data", "processed", "gharibo-research-gold-v0.1", "dataset-card.json");
  if (fs.existsSync(datasetCardPath)) {
    try {
      const card = JSON.parse(fs.readFileSync(datasetCardPath, "utf8"));
      const expectedHash = card.hashes?.datasetHash;
      checks.push(
        expect(
          "real dataset artifact integrity — dataset-card.json present and parseable",
          !!card.datasetName && !!expectedHash,
          `GHARIBO-Research-Gold-v0.1 — datasetHash=${expectedHash?.slice(0, 12)}…, ${card.counts?.totalExamples} examples`,
        ),
      );
      // Verify split files exist
      const splitDir = path.dirname(datasetCardPath);
      const splitFiles = ["train.jsonl", "validation.jsonl", "test.jsonl"];
      const allSplitsExist = splitFiles.every((sf) => fs.existsSync(path.join(splitDir, sf)));
      checks.push(
        expect(
          "real dataset split files (train/validation/test) all present",
          allSplitsExist,
          allSplitsExist
            ? `train.jsonl, validation.jsonl, test.jsonl all exist in ${splitDir}`
            : `missing split file(s)`,
        ),
      );
    } catch (e) {
      checks.push(
        fail("real dataset artifact integrity", `failed to parse dataset-card.json: ${e}`),
      );
    }
  } else {
    checks.push(
      na(
        "real dataset artifact integrity (Section B)",
        `no dataset-card.json at ${datasetCardPath} — dataset not yet built`,
      ),
    );
  }

  return { id: "1", title: "dataset integrity validation", checks };
}

// ===========================================================================
// Gate 2 — split overlap check
// ===========================================================================

function gateSplitOverlap(): Gate {
  const checks: Check[] = [];
  const N = 240; // >= 200 required
  const records = fixtureRecords(N, "split");
  const inputs = records.map((r) => ({
    id: r.id,
    lineHash: recordLineHash(toCanonicalInput(r)),
  }));
  const policy = defaultSplitPolicy(3407); // 80/10/10, min 10 per split
  const result = computeSplits(inputs, policy);
  const { train, validation, test } = result.splits;

  const setTrain = new Set(train);
  const setVal = new Set(validation);
  const setTest = new Set(test);
  const all = [...train, ...validation, ...test];

  const disjoint =
    [...setTrain].every((x) => !setVal.has(x) && !setTest.has(x)) &&
    [...setVal].every((x) => !setTest.has(x));
  checks.push(
    expect(
      "TRAIN / VALIDATION / TEST are pairwise disjoint",
      disjoint,
      `${FIXTURE_LABEL} — |train|=${train.length} |validation|=${validation.length} |test|=${test.length}, no shared ids`,
    ),
  );

  checks.push(
    expect(
      "the union of the splits equals the input set exactly",
      all.length === N && new Set(all).size === N &&
        [...all].sort().join("\n") === inputs.map((r) => r.id).sort().join("\n"),
      `${FIXTURE_LABEL} — ${all.length} assigned ids, ${new Set(all).size} distinct, equal to the ${N}-record input`,
    ),
  );

  checks.push(
    expect(
      "every record lands in exactly one split",
      new Set(all).size === all.length && all.length === N,
      `${FIXTURE_LABEL} — no record duplicated, no record dropped`,
    ),
  );

  const expected = { train: Math.floor(N * 0.8), validation: Math.floor(N * 0.1) };
  const countsOk =
    result.counts.train === expected.train &&
    result.counts.validation === expected.validation &&
    result.counts.test === N - expected.train - expected.validation &&
    Math.min(result.counts.train, result.counts.validation, result.counts.test) >= policy.minimumRecordsPerSplit;
  checks.push(
    expect(
      "deterministic counts respect the 80/10/10 policy and the per-split minimum",
      countsOk,
      `${FIXTURE_LABEL} — train=${result.counts.train} validation=${result.counts.validation} test=${result.counts.test} (min ${policy.minimumRecordsPerSplit})`,
    ),
  );

  const lineHashOf = new Map(inputs.map((r) => [r.id, r.lineHash]));
  const hashesOk =
    result.splitHashes.train === splitHashFromLineHashes(train.map((id) => lineHashOf.get(id)!)) &&
    result.splitHashes.validation === splitHashFromLineHashes(validation.map((id) => lineHashOf.get(id)!)) &&
    result.splitHashes.test === splitHashFromLineHashes(test.map((id) => lineHashOf.get(id)!));
  checks.push(
    expect(
      "per-split hashes are the order-independent content hashes of their members",
      hashesOk,
      `${FIXTURE_LABEL} — splitHash(S) = sha256(sort(recordLineHash).join("\\n"))`,
    ),
  );

  return { id: "2", title: "split overlap check", checks };
}

// ===========================================================================
// Gate 3 — deterministic regeneration check
// ===========================================================================

function gateDeterministicRegeneration(): Gate {
  const checks: Check[] = [];
  const N = 240;
  const records = fixtureRecords(N, "regen");
  const inputs = records.map((r) => ({
    id: r.id,
    lineHash: recordLineHash(toCanonicalInput(r)),
  }));

  // ---- same seed twice → byte-identical ------------------------------------
  const a = computeSplits(inputs, defaultSplitPolicy(3407));
  const b = computeSplits([...inputs], defaultSplitPolicy(3407));
  const sameBytes = JSON.stringify(a) === JSON.stringify(b);
  checks.push(
    expect(
      "same seed twice → byte-identical split result (membership, order and hashes)",
      sameBytes,
      `${FIXTURE_LABEL} — JSON.stringify(result) identical across two independent cuts of ${N} records`,
    ),
  );

  // ---- input order must not matter (hash-keyed assignment) -----------------
  const c = computeSplits([...inputs].reverse(), defaultSplitPolicy(3407));
  checks.push(
    expect(
      "input order does not affect the cut (assignment is keyed by content hash)",
      JSON.stringify(a.splits) === JSON.stringify(c.splits) &&
        JSON.stringify(a.splitHashes) === JSON.stringify(c.splitHashes),
      `${FIXTURE_LABEL} — reversed input yields the same membership and hashes`,
    ),
  );

  // ---- different seed → the split changes ----------------------------------
  const d = computeSplits(inputs, defaultSplitPolicy(3408));
  const membershipChanged =
    JSON.stringify(a.splits.train) !== JSON.stringify(d.splits.train) ||
    JSON.stringify(a.splits.validation) !== JSON.stringify(d.splits.validation) ||
    JSON.stringify(a.splits.test) !== JSON.stringify(d.splits.test);
  checks.push(
    expect(
      "different seed → the split changes (the seed drives the cut)",
      membershipChanged && JSON.stringify(a.splitHashes) !== JSON.stringify(d.splitHashes),
      `${FIXTURE_LABEL} — seed 3407 vs 3408 produce different membership and split hashes`,
    ),
  );

  // ---- canonical serialization is stable -----------------------------------
  const rec = records[0];
  const canonical = toCanonicalInput(rec);
  const line = canonicalLine(canonical);

  checks.push(
    expect(
      "canonical line uses the fixed field order and contains no structural whitespace",
      JSON.stringify(Object.keys(JSON.parse(line))) === JSON.stringify([...CANONICAL_RECORD_FIELDS]) &&
        line === JSON.stringify(JSON.parse(line)),
      `${FIXTURE_LABEL} — keys in CANONICAL_RECORD_FIELDS order; JSON.parse→stringify round-trips byte-for-byte`,
    ),
  );

  const again = canonicalLine(toCanonicalInput(rec));
  checks.push(
    expect(
      "canonical serialization is stable across repeated calls",
      line === again && recordLineHash(canonical) === sha256Hex(line),
      `${FIXTURE_LABEL} — canonicalLine and recordLineHash are pure functions of the record`,
    ),
  );

  // ---- canonicalJson (sorted keys) is insertion-order independent ----------
  const objA = { z: 1, a: { d: [1, 2], c: 2 }, m: "x" };
  const objB = { m: "x", a: { c: 2, d: [1, 2] }, z: 1 };
  checks.push(
    expect(
      "canonicalJson sorts keys recursively → insertion order is irrelevant",
      canonicalJson(objA) === canonicalJson(objB) &&
        sha256Canonical(objA) === sha256Canonical(objB) &&
        canonicalJson(objA) === '{"a":{"c":2,"d":[1,2]},"m":"x","z":1}',
      `${FIXTURE_LABEL} — equal hashes for two different key orderings; no whitespace emitted`,
    ),
  );

  // ---- normalization is part of the canonical form -------------------------
  const normalizedA = canonicalLine(toCanonicalInput({ ...rec, input: `  ${rec.input}  ` }));
  const normalizedB = canonicalLine(toCanonicalInput({ ...rec, tags: [...rec.tags].reverse() }));
  checks.push(
    expect(
      "normalization (trim + NFC + sorted tags) makes the canonical line canonical",
      normalizedA === line && normalizedB === line,
      `${FIXTURE_LABEL} — surrounding whitespace and tag order do not change the canonical bytes`,
    ),
  );

  return { id: "3", title: "deterministic regeneration check", checks };
}

// ===========================================================================
// Gate 4 — secret scan
// ===========================================================================

/**
 * Strict token shapes. Deliberately narrow so that the repository's own
 * redaction PATTERNS (`hf_[A-Za-z0-9]{20,}` etc.) cannot match: a regex literal
 * has `[`, `|` or `)` after the prefix, none of which are in the token alphabet.
 */
const SECRET_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "huggingface-token", re: /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{30,}/g },
  { id: "github-pat-classic", re: /(?<![A-Za-z0-9])ghp_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g },
  { id: "github-pat-fine-grained", re: /(?<![A-Za-z0-9])github_pat_[A-Za-z0-9_]{20,}/g },
  { id: "github-oauth-token", re: /(?<![A-Za-z0-9])gho_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g },
  { id: "github-app-token", re: /(?<![A-Za-z0-9])(?:ghu|ghs)_[A-Za-z0-9]{36}(?![A-Za-z0-9])/g },
  { id: "openai-style-key", re: /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g },
  { id: "aws-access-key-id", re: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/g },
  { id: "kaggle-key-assignment", re: /\bKAGGLE_KEY\b\s*[:=]\s*["']?[0-9a-fA-F]{32}\b/g },
  { id: "kaggle-json-key", re: /"key"\s*:\s*"[0-9a-fA-F]{32}"/g },
  { id: "bearer-token", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{24,}/g },
  {
    id: "credential-url",
    re: /[a-z][a-z0-9+.\-]*:\/\/[A-Za-z0-9._%+-]{1,64}:[A-Za-z0-9._%+-]{6,}@/g,
  },
  { id: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/** Files that are build output rather than source (defensive; not git-tracked). */
const SCAN_EXCLUDES = [
  /(^|\/)node_modules\//,
  /(^|\/)\.git\//,
  /(^|\/)\.next\//,
  /(^|\/)(dist|build|out)\//,
  /\.tsbuildinfo$/,
  /\.(png|jpe?g|gif|ico|webp|woff2?|ttf|otf|zip|gz|pdf|db|sqlite|so|dll|node)$/i,
];

/** Lists git-tracked files (falls back to a filtered walk when git is absent). */
function trackedFiles(): { files: string[]; source: string } {
  try {
    const out = execFileSync("git", ["ls-files", "-z"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const files = out.split("\0").filter(Boolean);
    if (files.length > 0) return { files, source: "git ls-files" };
  } catch {
    /* fall through to the walk */
  }
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir)) {
      const rel = path.relative(ROOT, path.join(dir, entry)).split(path.sep).join("/");
      if (SCAN_EXCLUDES.some((re) => re.test(rel + "/"))) continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else files.push(rel);
    }
  };
  walk(ROOT);
  return { files, source: "filesystem walk (git unavailable)" };
}

function gateSecretScan(): Gate {
  const checks: Check[] = [];
  const { files, source } = trackedFiles();
  const hits: string[] = [];
  let scanned = 0;

  for (const rel of files) {
    if (SCAN_EXCLUDES.some((re) => re.test(rel))) continue;
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    let text: string;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    scanned++;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const { id, re } of SECRET_PATTERNS) {
        re.lastIndex = 0;
        if (re.test(lines[i])) hits.push(`${rel}:${i + 1} [${id}]`);
      }
    }
  }

  checks.push(
    expect(
      "no secret-shaped token in any git-tracked file",
      hits.length === 0,
      hits.length === 0
        ? `${scanned} file(s) scanned (${source}); ${SECRET_PATTERNS.length} token shapes; 0 hits — includes the whole scripts/qualify/ tree`
        : `${hits.length} hit(s): ${hits.slice(0, 20).join(" | ")}${hits.length > 20 ? " …" : ""}`,
    ),
  );

  // ---- scanner self-test: it must not flag the repo's own redaction patterns
  const redactionCorpus = [
    "\\b(?:hf_|ghp_|github_pat_|sk-)[A-Za-z0-9_\\-]{12,}\\b",
    "\\bhf_[A-Za-z0-9]{20,}\\b",
    "\\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\\b",
    "\\bsk-[A-Za-z0-9]{20,}\\b",
    "`hf_`/`ghp_`/`sk-`-shaped strings",
    "Bearer ${apiKey}",
  ];
  const falsePositives: string[] = [];
  for (const line of redactionCorpus) {
    for (const { id, re } of SECRET_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(line)) falsePositives.push(`${id} matched ${JSON.stringify(line)}`);
    }
  }
  checks.push(
    expect(
      "scanner does not false-positive on the harness's own redaction patterns",
      falsePositives.length === 0,
      falsePositives.length === 0
        ? `${redactionCorpus.length} known redaction/pattern lines produce 0 hits`
        : `false positive(s): ${falsePositives.join(" | ")}`,
    ),
  );

  // ---- scanner self-test: it MUST flag synthetic real-looking tokens -------
  // Built at runtime so no token-shaped literal exists in this file.
  const synthetic = [
    ["huggingface-token", "hf_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7"],
    ["github-pat-classic", "ghp_" + "a".repeat(36)],
    ["github-pat-fine-grained", "github_pat_" + "B".repeat(24)],
    ["openai-style-key", "sk-" + "c".repeat(32)],
    ["aws-access-key-id", "AKIA" + "Q".repeat(16)],
    ["bearer-token", "Bearer " + "d".repeat(32)],
    ["credential-url", "postgres://gharibo:" + "e".repeat(12) + "@db.internal:5432/app"],
    ["kaggle-key-assignment", "KAGGLE_KEY=" + "f".repeat(32)],
  ];
  const missed: string[] = [];
  for (const [id, sample] of synthetic) {
    const re = SECRET_PATTERNS.find((p) => p.id === id)!.re;
    re.lastIndex = 0;
    if (!re.test(sample)) missed.push(id);
  }
  checks.push(
    expect(
      "scanner detects synthetic real-looking tokens (calibration)",
      missed.length === 0,
      missed.length === 0
        ? `${synthetic.length} synthetic token shapes detected (values generated at runtime, never written to disk)`
        : `missed: ${missed.join(", ")}`,
    ),
  );

  return { id: "4", title: "secret scan", checks };
}

// ===========================================================================
// Gate 5 — Training Package hash reproduction
// ===========================================================================

/** Pins the wall clock so the only variable under test is ordering/serialization. */
const REAL_DATE = globalThis.Date;
function pinClock(iso: string): void {
  const ms = REAL_DATE.parse(iso);
  class PinnedDate extends REAL_DATE {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(ms);
      else super(...(args as []));
    }
    static now(): number {
      return ms;
    }
  }
  (globalThis as { Date: unknown }).Date = PinnedDate;
}
function unpinClock(): void {
  (globalThis as { Date: unknown }).Date = REAL_DATE;
}

function fileEnding(files: Array<{ relativePath: string; content: string }>, suffix: string) {
  return files.find((f) => f.relativePath.endsWith(suffix));
}

function gatePackageReproduction(): Gate {
  const checks: Check[] = [];

  // ---- fixtures: 120 TRAINING_READY records + a DRAFT dataset + a run -------
  const records = fixtureRecords(120, "pkg");
  const ids = records.map((r) => dataFactoryRepository.create(toDataFactoryInput(r)).id);
  const draft = datasetsRepository.create("fixture-dataset-m3a", ids);
  const run = trainingRunsRepository.create({
    baseModel: "openai/gpt-oss-20b",
    method: "qlora",
    datasetId: null,
    datasetVersion: null,
    trainExamples: null,
    validationExamples: null,
    epochs: null,
    learningRate: null,
    batchSize: null,
    gradientAccumulation: null,
    loraRank: 16,
    loraAlpha: 32,
    targetModules: ["q_proj"],
    quantization: "4-bit",
    seed: 3407,
    device: null,
    startTime: null,
    endTime: null,
    checkpointPath: null,
    logs: null,
    metrics: {},
    preflightResult: null,
  });

  const opts = { experimentId: "GHARIBO-exp-001", runId: run.runId, datasetId: draft.id };

  // Two independent builds of the SAME inputs. The clock is pinned so the only
  // thing under test is pipeline determinism (created_at is wall-clock by design).
  pinClock("2026-09-14T00:00:00.000Z");
  const first = buildPackageForRun(opts);
  const second = buildPackageForRun(opts);
  unpinClock();

  checks.push(
    expect(
      "buildPackageForRun twice → identical package_id (content address)",
      first.pkg.packageId === second.pkg.packageId,
      `${FIXTURE_LABEL} — package_id=${first.pkg.packageId} on both builds`,
    ),
  );

  const splitSuffixes = ["dataset/train.jsonl", "dataset/validation.jsonl", "dataset/test.jsonl"];
  const jsonlEqual = splitSuffixes.every((s) => {
    const a = fileEnding(first.files, s);
    const b = fileEnding(second.files, s);
    return !!a && !!b && a.content === b.content && a.sha256 === b.sha256;
  });
  checks.push(
    expect(
      "buildPackageForRun twice → identical dataset/*.jsonl bytes",
      jsonlEqual,
      `${FIXTURE_LABEL} — train/validation/test JSONL byte-for-byte equal (content + sha256)`,
    ),
  );

  const sumsA = fileEnding(first.files, "CHECKSUMS.sha256");
  const sumsB = fileEnding(second.files, "CHECKSUMS.sha256");
  checks.push(
    expect(
      "buildPackageForRun twice → identical CHECKSUMS.sha256",
      !!sumsA && !!sumsB && sumsA.content === sumsB.content,
      `${FIXTURE_LABEL} — manifest-of-hashes rollup identical across both builds`,
    ),
  );

  // ---- re-assembly of the SAME issued package is byte-identical ------------
  const row = first.packageRow;
  const reassembled = assembleBundleForPackage(row);
  const reassembledEqual = reassembled.files.every((f) => {
    const original = first.files.find((o) => o.relativePath === f.relativePath);
    return !!original && original.content === f.content && original.sha256 === f.sha256;
  });
  checks.push(
    expect(
      "assembleBundleForPackage re-assembly is byte-identical to the original build (ADR-0012)",
      reassembledEqual && reassembled.files.length === first.files.length,
      `${FIXTURE_LABEL} — all ${first.files.length} bundle files equal after re-assembly`,
    ),
  );

  checks.push(
    expect(
      "stored manifest re-derives the same package_id (content address round-trip)",
      computePackageIdFromManifest(row.manifest) === first.pkg.packageId,
      `${FIXTURE_LABEL} — sha256(canonical manifest with package_id="") matches the emitted id`,
    ),
  );

  // ---- the M2 canonical-order fix (getSplits ORDER BY) ---------------------
  // Regression here means the old non-determinism bug is back → HARD FAILURE.
  const datasetId = first.pkg.dataset.datasetId;
  const persisted = datasetsRepository.getSplits(datasetId);
  const lineHashOf = new Map(
    ids.map((id) => [id, recordLineHash(toCanonicalInput(dataFactoryRepository.get(id)!))]),
  );
  const canonicalOrder = (list: string[]): string[] =>
    [...list].sort((x, y) => {
      const hx = lineHashOf.get(x)!;
      const hy = lineHashOf.get(y)!;
      if (hx < hy) return -1;
      if (hx > hy) return 1;
      return x < y ? -1 : x > y ? 1 : 0;
    });

  const orderStable =
    JSON.stringify(canonicalOrder(persisted.train)) === JSON.stringify(persisted.train) &&
    JSON.stringify(canonicalOrder(persisted.validation)) === JSON.stringify(persisted.validation) &&
    JSON.stringify(canonicalOrder(persisted.test)) === JSON.stringify(persisted.test);
  checks.push(
    expect(
      "getSplits returns the canonical total order (split_name, record_line_hash, record_id) — M2 regression guard",
      orderStable,
      orderStable
        ? `${FIXTURE_LABEL} — persisted membership is sorted by (record_line_hash, record_id) in every split`
        : `${FIXTURE_LABEL} — HARD FAILURE: persisted split order is NOT canonical; the non-deterministic ordering bug is back`,
    ),
  );

  const trainFile = fileEnding(first.files, "dataset/train.jsonl")!;
  const expectedTrain =
    persisted.train.map((id) => canonicalLine(toCanonicalInput(dataFactoryRepository.get(id)!))).join("\n") +
    (persisted.train.length ? "\n" : "");
  checks.push(
    expect(
      "train.jsonl bytes are exactly the canonical getSplits order",
      trainFile.content === expectedTrain,
      `${FIXTURE_LABEL} — ${persisted.train.length} lines, order and bytes match the persisted canonical order`,
    ),
  );

  // ---- a single manifest input change must change the id -------------------
  const base = JSON.parse(row.manifest) as Record<string, any>;
  const mutations: Array<[string, (m: Record<string, any>) => void]> = [
    ["dataset.dataset_hash", (m) => (m.dataset.dataset_hash = "0".repeat(64))],
    ["dataset.split_hashes.train", (m) => (m.dataset.split_hashes.train = "1".repeat(64))],
    ["dataset.record_count", (m) => (m.dataset.record_count = m.dataset.record_count + 1)],
    ["seed", (m) => (m.seed = m.seed + 1)],
    ["learning_rate", (m) => (m.learning_rate = m.learning_rate + 1e-6)],
    ["sequence_length", (m) => (m.sequence_length = m.sequence_length + 512)],
    ["dtype", (m) => (m.dtype = m.dtype === "fp16" ? "bf16" : "fp16")],
    ["engine.engine_version", (m) => (m.engine.engine_version = m.engine.engine_version + "-x")],
    ["base_model_revision", (m) => (m.base_model_revision = "f".repeat(40))],
    ["harmony.reasoning_effort", (m) => (m.harmony.reasoning_effort = "high")],
  ];
  const unchanged: string[] = [];
  for (const [label, mutate] of mutations) {
    const copy = JSON.parse(JSON.stringify(base)) as Record<string, any>;
    mutate(copy);
    if (computePackageIdFromManifest(JSON.stringify(copy)) === first.pkg.packageId) unchanged.push(label);
  }
  checks.push(
    expect(
      "changing any single manifest input changes package_id",
      unchanged.length === 0,
      unchanged.length === 0
        ? `${FIXTURE_LABEL} — ${mutations.length} distinct manifest fields each produce a new content address`
        : `${FIXTURE_LABEL} — id did NOT change for: ${unchanged.join(", ")}`,
    ),
  );

  // ---- the only wall-clock field is created_at ----------------------------
  // Unpinned third build: everything except created_at (and the id derived from
  // it) must still match, documenting that created_at is the sole clock input.
  const third = buildPackageForRun(opts);
  // `package_id` is the content address of the manifest, so it moves with
  // created_at; strip both to isolate the clock as the only differing input.
  const stripClock = (m: Record<string, any>) => {
    const copy = JSON.parse(JSON.stringify(m)) as Record<string, any>;
    delete copy.created_at;
    delete copy.package_id;
    return JSON.stringify(copy);
  };
  const thirdManifest = JSON.parse(third.manifest) as Record<string, any>;
  checks.push(
    expect(
      "created_at is the only wall-clock input to the manifest (package_id follows from it)",
      stripClock(thirdManifest) === stripClock(base),
      `${FIXTURE_LABEL} — manifests identical once created_at and package_id are removed (created_at=${base.created_at} vs ${thirdManifest.created_at})`,
    ),
  );

  return { id: "5", title: "Training Package hash reproduction test", checks };
}

// ===========================================================================
// Gate 6 — source artifact integrity
// ===========================================================================

function gateSourceArtifactIntegrity(): Gate {
  const checks: Check[] = [];
  const manifestPath = path.join(ROOT, "data", "derived", "source-manifests", "legacy-ucl-source-manifest-v001.json");

  if (!fs.existsSync(manifestPath)) {
    checks.push(
      na(
        "source manifest present",
        `no source manifest at ${manifestPath} — Section A forensics not yet run`,
      ),
    );
    return { id: "6", title: "source artifact integrity", checks };
  }

  let manifest: any;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (e) {
    checks.push(fail("source manifest parseable", `failed to parse: ${e}`));
    return { id: "6", title: "source artifact integrity", checks };
  }

  checks.push(
    expect(
      "source manifest declares 8 files",
      manifest.files?.length === 8,
      `declared ${manifest.files?.length} files`,
    ),
  );

  // Verify each source file still exists and matches its SHA-256
  let allMatch = true;
  let verified = 0;
  for (const entry of manifest.files || []) {
    const srcPath = path.join(ROOT, entry.relativePath);
    if (!fs.existsSync(srcPath)) {
      checks.push(fail(`source file exists: ${entry.fileName}`, `missing at ${entry.relativePath}`));
      allMatch = false;
      continue;
    }
    const raw = fs.readFileSync(srcPath);
    const actualSha = require("node:crypto").createHash("sha256").update(raw).digest("hex");
    if (actualSha === entry.sha256) {
      verified++;
    } else {
      checks.push(
        fail(
          `SHA-256 match: ${entry.fileName}`,
          `expected ${entry.sha256.slice(0, 12)}… got ${actualSha.slice(0, 12)}…`,
        ),
      );
      allMatch = false;
    }
  }

  if (allMatch && verified === 8) {
    checks.push(
      pass(
        "all 8 source files present and SHA-256 verified",
        `${verified}/8 files match their manifest hashes`,
      ),
    );
  }

  // Check that SECURITY_BATCH_004 is correctly marked unavailable
  const unavail = manifest.unavailableFiles || [];
  checks.push(
    expect(
      "SECURITY_BATCH_004 correctly marked unavailable",
      unavail.some((u: any) => u.fileName?.includes("BATCH_004")),
      unavail.length > 0 ? `unavailable: ${unavail.map((u: any) => u.fileName).join(", ")}` : "no unavailable files declared",
    ),
  );

  // Check aggregate stats
  const agg = manifest.aggregateStats || {};
  checks.push(
    expect(
      "zero parse errors across all source files",
      (agg.totalParseErrors ?? 0) === 0,
      `${agg.totalParseErrors ?? 0} parse errors`,
    ),
  );
  checks.push(
    expect(
      "zero duplicate lines across all JSONL files",
      (agg.totalDuplicateLines ?? 0) === 0,
      `${agg.totalDuplicateLines ?? 0} duplicate lines`,
    ),
  );
  checks.push(
    expect(
      "zero broken relation references",
      (agg.relationReferentialIntegrity?.brokenReferences ?? 0) === 0,
      `${agg.relationReferentialIntegrity?.brokenReferences ?? 0} broken references out of ${agg.relationReferentialIntegrity?.totalRelations ?? 0} relations`,
    ),
  );

  return { id: "6", title: "source artifact integrity", checks };
}

// ===========================================================================
// Gate 7 — deterministic dataset regeneration
// ===========================================================================

function gateDatasetDeterministicRegeneration(): Gate {
  const checks: Check[] = [];
  const cardPath = path.join(ROOT, "data", "processed", "gharibo-research-gold-v0.1", "dataset-card.json");

  if (!fs.existsSync(cardPath)) {
    checks.push(na("dataset regeneration", "dataset-card.json not found — dataset not yet built"));
    return { id: "7", title: "deterministic dataset regeneration check", checks };
  }

  const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));
  const splitDir = path.dirname(cardPath);

  // The Python generation script computed record line hashes as:
  //   sha256(json.dumps(ex, ensure_ascii=False, sort_keys=True).encode())
  // JavaScript's JSON.stringify with sortKeys is NOT equivalent for nested objects.
  // Instead of recomputing from scratch (which would require a Python-compatible
  // canonical JSON serializer), we re-read the raw line bytes and use them directly.
  // The split hash is sha256(sorted(record_line_hashes).join("\n"))
  // where record_line_hash = sha256(raw_line_bytes).
  // This is a content-address check: same file bytes → same hash.
  const splitFiles = [
    { name: "train", file: "train.jsonl", hashKey: "trainSplitHash" },
    { name: "validation", file: "validation.jsonl", hashKey: "validationSplitHash" },
    { name: "test", file: "test.jsonl", hashKey: "testSplitHash" },
  ];

  for (const sp of splitFiles) {
    const splitPath = path.join(splitDir, sp.file);
    if (!fs.existsSync(splitPath)) {
      checks.push(fail(`recompute ${sp.name} split hash`, `file missing: ${sp.file}`));
      continue;
    }
    const rawText = fs.readFileSync(splitPath, "utf8").trim();
    const lines = rawText ? rawText.split(/\r?\n/) : [];
    // Record line hash = sha256 of the raw line bytes (as written to disk, CR stripped)
    const lineHashes = lines
      .map((l) => {
        const buf = Buffer.from(l, "utf8");
        return require("node:crypto").createHash("sha256").update(buf).digest("hex");
      })
      .sort();
    const recomputedHash = require("node:crypto")
      .createHash("sha256")
      .update(lineHashes.join("\n"))
      .digest("hex");

    const declaredHash = card.hashes?.[sp.hashKey];
    checks.push(
      expect(
        `recomputed ${sp.name} split hash matches dataset-card.json`,
        recomputedHash === declaredHash,
        `recomputed=${recomputedHash.slice(0, 12)}… declared=${declaredHash?.slice(0, 12)}… (${lines.length} records)`,
      ),
    );
  }

  // Verify no overlap between splits
  const splitIdSets: Record<string, Set<string>> = {};
  for (const sp of splitFiles) {
    const splitPath = path.join(splitDir, sp.file);
    if (!fs.existsSync(splitPath)) continue;
    const lines = fs.readFileSync(splitPath, "utf8").trim().split("\n");
    const ids = new Set<string>();
    for (const l of lines) {
      const obj = JSON.parse(l);
      // Use the user content hash as identity
      const userContent = obj.messages?.find((m: any) => m.role === "user")?.content || "";
      ids.add(require("node:crypto").createHash("sha256").update(userContent).digest("hex"));
    }
    splitIdSets[sp.name] = ids;
  }

  const overlaps: string[] = [];
  if (splitIdSets.train && splitIdSets.validation) {
    const ov = [...splitIdSets.train].filter((x) => splitIdSets.validation.has(x));
    if (ov.length > 0) overlaps.push(`train∩validation: ${ov.length}`);
  }
  if (splitIdSets.train && splitIdSets.test) {
    const ov = [...splitIdSets.train].filter((x) => splitIdSets.test.has(x));
    if (ov.length > 0) overlaps.push(`train∩test: ${ov.length}`);
  }
  if (splitIdSets.validation && splitIdSets.test) {
    const ov = [...splitIdSets.validation].filter((x) => splitIdSets.test.has(x));
    if (ov.length > 0) overlaps.push(`validation∩test: ${ov.length}`);
  }
  checks.push(
    expect(
      "no train/validation/test overlap (real dataset)",
      overlaps.length === 0,
      overlaps.length === 0
        ? `all three splits are pairwise disjoint`
        : `overlaps: ${overlaps.join(", ")}`,
    ),
  );

  return { id: "7", title: "deterministic dataset regeneration check", checks };
}

// ===========================================================================
// Gate 8 — provenance coverage
// ===========================================================================

function gateProvenanceCoverage(): Gate {
  const checks: Check[] = [];
  const cardPath = path.join(ROOT, "data", "processed", "gharibo-research-gold-v0.1", "dataset-card.json");

  if (!fs.existsSync(cardPath)) {
    checks.push(na("provenance coverage", "dataset-card.json not found"));
    return { id: "8", title: "provenance coverage", checks };
  }

  const card = JSON.parse(fs.readFileSync(cardPath, "utf8"));

  checks.push(
    expect(
      "dataset card has source manifest hash",
      !!card.sourceArtifacts?.sourceManifestHash,
      `sourceManifestHash=${card.sourceArtifacts?.sourceManifestHash?.slice(0, 12)}…`,
    ),
  );

  checks.push(
    expect(
      "dataset card has source root path",
      !!card.sourceArtifacts?.sourceRoot,
      `sourceRoot=${card.sourceArtifacts?.sourceRoot}`,
    ),
  );

  checks.push(
    expect(
      "dataset card declares source file count (8 expected)",
      card.sourceArtifacts?.sourceFilesCount === 8,
      `sourceFilesCount=${card.sourceArtifacts?.sourceFilesCount}`,
    ),
  );

  checks.push(
    expect(
      "dataset card has provenance map",
      !!card.provenanceMap,
      `provenanceMap present with ${card.provenanceMap?.sourceFiles?.length || 0} source files`,
    ),
  );

  // Verify all training examples reference a source file in provenance
  const examplesPath = path.join(ROOT, "data", "processed", "training-examples", "gharibo-research-gold-v0.1-examples.jsonl");
  if (fs.existsSync(examplesPath)) {
    const lines = fs.readFileSync(examplesPath, "utf8").trim().split("\n");
    let withProvenance = 0;
    for (const l of lines) {
      const obj = JSON.parse(l);
      const assistant = obj.messages?.find((m: any) => m.role === "assistant");
      if (assistant) {
        const content = JSON.parse(assistant.content);
        if (content.provenance?.sourceFile) withProvenance++;
      }
    }
    checks.push(
      expect(
        "every training example has provenance.sourceFile",
        withProvenance === lines.length,
        `${withProvenance}/${lines.length} examples have provenance.sourceFile`,
      ),
    );
  } else {
    checks.push(na("training examples provenance", "examples file not found"));
  }

  return { id: "8", title: "provenance coverage", checks };
}

// ===========================================================================
// Gate 9 — notebook generator/render drift
// ===========================================================================

function gateNotebookDrift(): Gate {
  const checks: Check[] = [];

  // Run the generator in --check mode (which compares content address)
  try {
    const result = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "qualify", "qualify-kaggle-env.mjs"), "--check"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const upToDate = result.includes("up to date");
    checks.push(
      expect(
        "qualification notebook is up to date (generator == rendered)",
        upToDate,
        result.trim().split("\n")[0],
      ),
    );
  } catch (e) {
    checks.push(
      fail("qualification notebook drift check", `generator --check failed: ${e}`),
    );
  }

  return { id: "9", title: "notebook generator/render drift", checks };
}

// ===========================================================================
// Gate 10 — documentation facts
// ===========================================================================

function gateDocumentationFacts(): Gate {
  const checks: Check[] = [];

  // Verify docs:validate passes
  try {
    const result = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "validate-docs.mjs")],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    checks.push(
      expect(
        "npm run docs:validate passes",
        !result.toLowerCase().includes("fail"),
        result.trim().split("\n").slice(-2).join(" "),
      ),
    );
  } catch (e) {
    const output = (e as any)?.stdout || String(e);
    checks.push(
      fail("docs:validate", `failed: ${output.slice(0, 200)}`),
    );
  }

  // Verify verify:m2 --check passes
  try {
    const result = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts", "verify-m2.mjs"), "--check"],
      { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    checks.push(
      expect(
        "npm run verify:m2 --check passes (metric count, page count, ADR count)",
        !result.toLowerCase().includes("fail"),
        result.trim().split("\n").slice(-2).join(" "),
      ),
    );
  } catch (e) {
    const output = (e as any)?.stdout || String(e);
    checks.push(
      fail("verify:m2 --check", `failed: ${output.slice(0, 200)}`),
    );
  }

  return { id: "10", title: "documentation facts", checks };
}

// ===========================================================================
// Gate 11 — no fabricated benchmark results
// ===========================================================================

function gateNoFabricatedBenchmarkResults(): Gate {
  const checks: Check[] = [];
  const benchmarkPath = path.join(ROOT, "docs", "RESEARCH_BENCHMARK.md");

  if (!fs.existsSync(benchmarkPath)) {
    checks.push(fail("RESEARCH_BENCHMARK.md exists", "file not found"));
    return { id: "11", title: "no fabricated benchmark results", checks };
  }

  const content = fs.readFileSync(benchmarkPath, "utf8");

  // Check that NOT_RUN appears (no scores should have been fabricated)
  const notRunCount = (content.match(/NOT_RUN/g) || []).length;
  checks.push(
    expect(
      "benchmark status is NOT_RUN (no fabricated scores)",
      notRunCount >= 2,
      `${notRunCount} NOT_RUN occurrences found in RESEARCH_BENCHMARK.md`,
    ),
  );

  // Check that no numeric score appears (e.g., 0.95, 85%)
  const scorePatterns = [
    /(?:base_score|candidate_score)\s*[:=]\s*[0-9]/i,
    /(?:precision|recall|f1|accuracy)\s*[:=]\s*0\.\d+/i,
  ];
  let foundScore = false;
  for (const re of scorePatterns) {
    if (re.test(content)) {
      foundScore = true;
      break;
    }
  }
  checks.push(
    expect(
      "no fabricated numeric benchmark scores present",
      !foundScore,
      foundScore ? "found a numeric score pattern" : "no score-shaped patterns found",
    ),
  );

  // Check that both Base and Candidate are NOT_RUN
  checks.push(
    expect(
      "Base model status is NOT_RUN",
      /Base.*NOT_RUN/i.test(content),
      "Base status declared as NOT_RUN",
    ),
  );
  checks.push(
    expect(
      "Candidate model status is NOT_RUN",
      /Candidate.*NOT_RUN/i.test(content),
      "Candidate status declared as NOT_RUN",
    ),
  );

  return { id: "11", title: "no fabricated benchmark results", checks };
}

// ===========================================================================
// Gate 12 — Kaggle-dependent gates (PENDING_EXTERNAL_EXECUTION)
// ===========================================================================

function gateKaggleDependent(): Gate {
  const checks: Check[] = [];

  checks.push(
    pending(
      "environment qualification (real Kaggle T4 run required)",
      "The qualification notebook must be executed on a real Kaggle T4 instance to resolve dependency versions, verify GPU compatibility, and produce a qualification_hash. This gate cannot be faked — it requires a real GPU run.",
    ),
  );

  checks.push(
    pending(
      "training execution (not started — STOP condition)",
      "No training has been executed. The CTO directive explicitly states DO NOT START TRAINING. This gate will remain PENDING until training is authorized.",
    ),
  );

  checks.push(
    pending(
      "benchmark evaluation (real GPU inference required)",
      "Benchmark metrics require real model inference on GPU. All metric definitions are machine-verifiable but scores cannot be computed without a trained model. Base=NOT_RUN, Candidate=NOT_RUN.",
    ),
  );

  return { id: "12", title: "Kaggle-dependent gates (external execution required)", checks };
}

// ===========================================================================
// Gate 13 — qualification safety (static, training-free)
// ===========================================================================

/**
 * The qualification harness must never contain a training primitive. The notebook
 * arms RUNTIME tripwires so that any optimizer construction/step, backward call or
 * scheduler construction raises; this gate enforces the same invariant STATICALLY,
 * on the generated notebook text, so a regression is caught even without a GPU.
 *
 * MATCHING RULE: a conservative raw-substring scan over the concatenated cell
 * sources (comments and string literals included). It is safe to be strict because
 * the tripwire code assembles the same names from concatenated fragments (e.g.
 * 'back' + 'ward', 'lr_' + 'scheduler'), so the forbidden invocation shapes never
 * appear in the notebook text. A match is therefore always a real primitive, never
 * a false positive on prose.
 *
 * SCOPE (v2.0.0): model LOADING is no longer forbidden — the qualification must
 * prove real gpt-oss-20b compatibility, so the loader, the tokenizer and the forward
 * pass are required. Everything that would TRAIN, enable gradients, or write a model
 * artifact stays forbidden.
 */
const TRAINING_PRIMITIVES = [
  "trainer.train(",
  ".train(",
  "optimizer.step(",
  ".step()",
  "loss.backward(",
  ".backward()",
  "torch.autograd.backward(",
  "autograd.grad(",
  "accelerator.backward(",
  "torch.optim.",
  "torch.optim.Optimizer(",
  "optim.AdamW",
  "lr_scheduler",
  "get_scheduler",
  "SFTTrainer",
  "SFTConfig",
  "Trainer(",
  "TrainingArguments(",
  "requires_grad_(",
  "enable_grad",
  "save_pretrained",
  "push_to_hub",
];

/** The model-compatibility sequence the harness must perform (contract §14.2/§14.3). */
const MISSION_STEPS = [
  "resolve_base_model_revision",
  "resolve_loader_model_revision",
  "load_tokenizer",
  "verify_harmony_encoding",
  "verify_harmony_tokenizer",
  "tokenize_real_example",
  "load_base_model",
  "init_qlora_adapters",
  "count_parameters",
  "collate_batch",
  "parameter_digest_before",
  "forward_dry_run",
  "parameter_digest_after",
  "verify_artifact_destination",
];

/** The artifact keys the mission requires inside `model_compatibility` (contract §14.3). */
const REQUIRED_MODEL_KEYS = [
  "qualification_only",
  "gpu",
  "vram",
  "cuda",
  "driver",
  "compute_capability",
  "python_version",
  "dependency_versions",
  "dependency_revisions",
  "base_model",
  "base_model_revision",
  "tokenizer_loaded",
  "harmony_verified",
  "real_example_tokenized",
  "model_loaded",
  "qlora_initialized",
  "batch_collated",
  "forward_dry_run_completed",
  "total_parameters",
  "trainable_parameters",
  "trainable_percentage",
  "vram_before_load",
  "vram_after_load",
  "vram_after_adapter_init",
  "peak_vram",
  "artifact_destination_writable",
  "optimizer_created",
  "backward_executed",
  "optimizer_step_executed",
  "training_loop_executed",
  "model_parameters_updated",
  "parameter_digest_before",
  "parameter_digest_after",
];

function gateQualificationSafety(): Gate {
  const checks: Check[] = [];
  const notebookPath = path.join(ROOT, "scripts", "qualify", "qualify-kaggle-env.ipynb");

  if (!fs.existsSync(notebookPath)) {
    checks.push(fail("qualification notebook exists", `missing ${notebookPath}`));
    return { id: "13", title: "qualification safety (static, training-free)", checks };
  }

  let notebookSource = "";
  try {
    const notebook = JSON.parse(fs.readFileSync(notebookPath, "utf8"));
    notebookSource = (notebook.cells ?? [])
      .map((c: any) => (Array.isArray(c.source) ? c.source.join("") : String(c.source ?? "")))
      .join("\n");
  } catch (e) {
    checks.push(fail("qualification notebook parseable", `failed to parse: ${e}`));
    return { id: "13", title: "qualification safety (static, training-free)", checks };
  }

  const found = TRAINING_PRIMITIVES.filter((token) => notebookSource.includes(token));
  checks.push(
    expect(
      "no training primitive appears in the generated qualification notebook",
      found.length === 0,
      found.length === 0
        ? `${TRAINING_PRIMITIVES.length} forbidden shapes scanned; 0 hits — the harness cannot train`
        : `forbidden training primitive(s) present: ${found.join(" | ")}`,
    ),
  );

  checks.push(
    expect(
      "the harness asserts QUALIFICATION_ONLY and arms runtime tripwires",
      /assert QUALIFICATION_ONLY is True/.test(notebookSource) &&
        /def arm_safety_tripwires\(\):/.test(notebookSource),
      "QUALIFICATION_ONLY is asserted and arm_safety_tripwires() is present in the notebook",
    ),
  );

  checks.push(
    expect(
      "the harness emits a qualification_safety evidence block from tripwire state + a parameter digest",
      /'qualification_safety': qualification_safety/.test(notebookSource) &&
        /PARAM_DIGEST_AFTER != PARAM_DIGEST_BEFORE/.test(notebookSource),
      "qualification_safety is attached to the record and is not a hardcoded boolean",
    ),
  );

  // ---- Real model-compatibility qualification (contract §14) --------------
  const missingSteps = MISSION_STEPS.filter((step) => !notebookSource.includes(`'${step}'`));
  checks.push(
    expect(
      "the harness performs the full real model-compatibility sequence",
      missingSteps.length === 0,
      missingSteps.length === 0
        ? `${MISSION_STEPS.length} named model-compatibility steps present (resolve revision → tokenizer → Harmony → tokenize → 4-bit load → QLoRA → collate → forward-only dry run → digest)`
        : `missing step(s): ${missingSteps.join(" | ")}`,
    ),
  );

  const missingKeys = REQUIRED_MODEL_KEYS.filter((key) => !notebookSource.includes(`'${key}':`));
  checks.push(
    expect(
      "the artifact carries every mission-mandated model_compatibility key",
      missingKeys.length === 0,
      missingKeys.length === 0
        ? `${REQUIRED_MODEL_KEYS.length} mandated keys assembled onto the record`
        : `missing key(s): ${missingKeys.join(" | ")}`,
    ),
  );

  checks.push(
    expect(
      "the harness proves no parameter was updated (digest before == after, no optimizer, no backward)",
      /def parameter_digest\(model\):/.test(notebookSource) &&
        /run_model_step\('parameter_digest_before'/.test(notebookSource) &&
        /run_model_step\('parameter_digest_after'/.test(notebookSource) &&
        /model_parameters_updated = bool\(PARAM_DIGEST_AFTER != PARAM_DIGEST_BEFORE\)/.test(notebookSource),
      "a deterministic digest over the trainable parameters is taken before and after the single forward-only dry run",
    ),
  );

  checks.push(
    expect(
      "the forward-only dry run runs under no_grad and receives no labels",
      (() => {
        const match = notebookSource.match(
          /def forward_dry_run\(\):([\s\S]*?)def probe_artifact_destination\(\):/,
        );
        if (!match) return false;

        const body = match[1];
        const modelForwardCount =
          (notebookSource.match(/outputs = MODEL\(\*\*model_inputs\)/g) ?? []).length;

        return (
          /with torch\.no_grad\(\):/.test(body) &&
          /'attention_mask': attention_mask_mapping/.test(body) &&
          /'use_cache': False/.test(body) &&
          /'output_router_logits': False/.test(body) &&
          /outputs = MODEL\(\*\*model_inputs\)/.test(body) &&
          !/'labels'\s*:/.test(body) &&
          modelForwardCount === 1
        );
      })(),
      "exactly one forward pass, under no_grad, using the prepared GPT-OSS attention-mask mapping, with no labels supplied so no loss is computed",
    ),
  );

  checks.push(
    expect(
      "a measured incompatibility is reported as QUALIFICATION_FAILED_MEASURED and never substituted",
      /QUALIFICATION_FAILED_MEASURED/.test(notebookSource) &&
        /No smaller model was substituted/.test(notebookSource),
      "the measured-failure status exists and the harness refuses to swap in a smaller model",
    ),
  );

  checks.push(
    expect(
      "the real GHARIBO dataset is required and hash-verified before use",
      /def locate_dataset_dir\(\):/.test(notebookSource) &&
        /EXPECTED_DATASET_HASH = DATASET\['dataset_hash'\]/.test(notebookSource) &&
        /def dataset_hash\(split_lines_map\):/.test(notebookSource),
      "the harness locates the attached dataset, recomputes the committed split/dataset hashes and aborts on any mismatch",
    ),
  );

  return { id: "13", title: "qualification safety (static, training-free)", checks };
}

// ===========================================================================
// Run + report
// ===========================================================================

const gates: Gate[] = [];

function runGate(fn: () => Gate, id: string, title: string): void {
  try {
    gates.push(fn());
  } catch (error) {
    const message = error instanceof Error ? `${error.message}` : String(error);
    gates.push({
      id,
      title,
      checks: [fail("gate execution", `gate threw: ${message.split("\n")[0]}`)],
    });
  }
}

runGate(gateDatasetIntegrity, "1", "dataset integrity validation");
runGate(gateSplitOverlap, "2", "split overlap check");
runGate(gateDeterministicRegeneration, "3", "deterministic regeneration check");
runGate(gateSecretScan, "4", "secret scan");
runGate(gatePackageReproduction, "5", "Training Package hash reproduction test");
runGate(gateSourceArtifactIntegrity, "6", "source artifact integrity");
runGate(gateDatasetDeterministicRegeneration, "7", "deterministic dataset regeneration check");
runGate(gateProvenanceCoverage, "8", "provenance coverage");
runGate(gateNotebookDrift, "9", "notebook generator/render drift");
runGate(gateDocumentationFacts, "10", "documentation facts");
runGate(gateNoFabricatedBenchmarkResults, "11", "no fabricated benchmark results");
runGate(gateKaggleDependent, "12", "Kaggle-dependent gates (external execution required)");
runGate(gateQualificationSafety, "13", "qualification safety (static, training-free)");

try {
  closeDb();
} catch {
  /* best effort */
}

console.log(LINE);
console.log("GHARIBO AI LAB — Milestone 3A gate verification");
console.log(LINE);
console.log(`${FIXTURE_LABEL} (every fixture-derived line below is synthetic and labelled)`);
console.log(LINE);

let passed = 0;
let failed = 0;
let notApplicable = 0;
let pendingExternal = 0;
const failedNames: string[] = [];

for (const gate of gates) {
  console.log(`Gate ${gate.id}  ${gate.title}`);
  for (const c of gate.checks) {
    if (c.status === "PASS") passed++;
    else if (c.status === "FAIL") {
      failed++;
      failedNames.push(`Gate ${gate.id} / ${c.name}`);
    } else if (c.status === "PENDING_EXTERNAL_EXECUTION") {
      pendingExternal++;
    } else notApplicable++;
    console.log(`  ${c.status.padEnd(28)} ${c.name}`);
    console.log(`  ${" ".repeat(28)} ${c.detail}`);
  }
}

console.log(LINE);
console.log(`  PASS ${passed}   NOT_APPLICABLE ${notApplicable}   PENDING_EXTERNAL_EXECUTION ${pendingExternal}   FAIL ${failed}`);

if (failed > 0) {
  for (const name of failedNames) console.log(`  FAILED: ${name}`);
  console.log(`RESULT: FAILED — ${failed} gate check(s) failed.`);
  process.exit(1);
}

if (pendingExternal > 0) {
  console.log(
    `RESULT: ${passed} check(s) passed; ${notApplicable} NOT_APPLICABLE; ${pendingExternal} PENDING_EXTERNAL_EXECUTION (require real Kaggle GPU run).`,
  );
  process.exit(0);
}

if (notApplicable > 0) {
  console.log(
    `RESULT: ${passed} check(s) passed; ${notApplicable} NOT_APPLICABLE.`,
  );
  process.exit(0);
}

console.log("RESULT: all gate checks passed.");
process.exit(0);

// Keep the `--check` flag meaningful in the signature even though FAIL is fatal
// in both modes (see the module header).
void CHECK;
