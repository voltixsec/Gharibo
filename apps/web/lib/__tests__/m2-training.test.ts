/**
 * M2 training-library tests (architecture M2 §3–§5, §15).
 *
 * Covers the contract invariants:
 *  1. Hashing determinism + order independence (hash.ts, canonical.ts)
 *  2. Deterministic seeded splits (split.ts)
 *  3. Canonical Training Package content addressing (package.ts, validate.ts)
 *  4. Harmony mapping (harmony.ts)
 *  5. Store-only ZIP writer validity + determinism (zip.ts)
 *
 * Pure modules — no DB, no network, no GPU.
 */
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  sha256Hex,
  sha256Bytes,
  canonicalJson,
  sha256Canonical,
  artifactRollup,
  isSha256Hex,
  isGitSha,
  utf8,
} from "@/lib/training/hash";
import {
  CANONICAL_RECORD_FIELDS,
  canonicalLine,
  canonicalRecord,
  datasetHashFromLines,
  normalizeText,
  recordLineHash,
  splitHashFromLineHashes,
  toCanonicalInput,
} from "@/lib/training/canonical";
import {
  computeSplits,
  defaultSplitPolicy,
  DEFAULT_SPLIT_SEED,
  EmptySplitError,
  type SplitRecordInput,
} from "@/lib/training/split";
import { renderHarmony, resolveDeveloperFraming } from "@/lib/training/harmony";
import {
  computePackageId,
  finalizePackage,
  isPackageIdValid,
  parseManifest,
  serializeManifest,
  toManifest,
  deriveEpochs,
  deriveLoRAFromRun,
} from "@/lib/training/package";
import { validatePackage, hasBlockingErrors, formatIssues } from "@/lib/training/validate";
import { createZip, crc32, type ZipEntry } from "@/lib/training/zip";
import type { TrainingRun } from "@gharibo/shared";
import { makeRecord, makeValidPackage } from "./_m2-fixtures";

// ============================================================
// 1. Hashing determinism + order independence
// ============================================================

describe("hash.ts", () => {
  it("sha256Hex is deterministic and matches the empty-string vector", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });

  it("sha256Bytes agrees with sha256Hex over the UTF-8 encoding", () => {
    const s = "héllo → wörld";
    expect(sha256Bytes(utf8(s))).toBe(sha256Hex(s));
  });

  it("canonicalJson sorts keys recursively (order-independent)", () => {
    const a = { b: 2, a: { d: 4, c: 3 } };
    const b = { a: { c: 3, d: 4 }, b: 2 };
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(canonicalJson(a)).toBe('{"a":{"c":3,"d":4},"b":2}');
  });

  it("sha256Canonical is order-independent", () => {
    expect(sha256Canonical({ x: 1, y: 2 })).toBe(sha256Canonical({ y: 2, x: 1 }));
  });

  it("artifactRollup is order-independent and deterministic", () => {
    const pairs = [
      { relativePath: "b.json", sha256: "b".repeat(64) },
      { relativePath: "a.json", sha256: "a".repeat(64) },
    ];
    const rolled = artifactRollup(pairs);
    expect(rolled).toBe(artifactRollup([...pairs].reverse()));
    expect(isSha256Hex(rolled)).toBe(true);
  });

  it("isSha256Hex / isGitSha validate shape", () => {
    expect(isSha256Hex("a".repeat(64))).toBe(true);
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex("A".repeat(64))).toBe(false);
    expect(isSha256Hex(null)).toBe(false);
    expect(isGitSha("0".repeat(40))).toBe(true);
    expect(isGitSha("0".repeat(39))).toBe(false);
  });
});

describe("canonical.ts", () => {
  it("canonicalLine uses the fixed key order", () => {
    const line = canonicalLine(toCanonicalInput(makeRecord()));
    expect(Object.keys(JSON.parse(line))).toEqual([...CANONICAL_RECORD_FIELDS]);
  });

  it("normalizeText trims and NFC-normalizes; null stays null", () => {
    expect(normalizeText("  x  ")).toBe("x");
    expect(normalizeText("e\u0301")).toBe("\u00e9");
    expect(normalizeText(null)).toBeNull();
    expect(normalizeText(undefined)).toBeNull();
  });

  it("canonicalRecord sorts tags and normalizes them", () => {
    const rec = canonicalRecord({ ...toCanonicalInput(makeRecord()), tags: ["b", " a ", "c"] });
    expect(rec.tags).toEqual(["a", "b", "c"]);
  });

  it("excludes volatile fields (id, timestamps, qualityScore)", () => {
    const r1 = makeRecord({ id: "one", qualityScore: 0.1, createdAt: "2026-01-01T00:00:00Z" });
    const r2 = makeRecord({ id: "two", qualityScore: 0.99, createdAt: "2026-12-31T00:00:00Z" });
    expect(canonicalLine(toCanonicalInput(r1))).toBe(canonicalLine(toCanonicalInput(r2)));
    expect(recordLineHash(toCanonicalInput(r1))).toBe(recordLineHash(toCanonicalInput(r2)));
  });

  it("datasetHashFromLines is order-independent and deterministic", () => {
    const lines = ["a", "b", "c"].map((s) => canonicalLine(toCanonicalInput(makeRecord({ input: s }))));
    const h1 = datasetHashFromLines(lines);
    const h2 = datasetHashFromLines([...lines].reverse());
    expect(h1).toBe(h2);
    expect(isSha256Hex(h1)).toBe(true);
    expect(datasetHashFromLines(lines)).toBe(h1);
  });

  it("splitHashFromLineHashes is order-independent", () => {
    const hashes = ["h1", "h2", "h3"];
    expect(splitHashFromLineHashes(hashes)).toBe(splitHashFromLineHashes([...hashes].reverse()));
  });
});

// ============================================================
// 2. Deterministic seeded splits
// ============================================================

function makeSplitRecords(n: number): SplitRecordInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `rec-${i}`,
    lineHash: sha256Hex(`record-content-${i}`),
  }));
}

describe("split.ts", () => {
  it("is deterministic across repeated calls (same seed → identical splits + hashes)", () => {
    const records = makeSplitRecords(100);
    const policy = defaultSplitPolicy();
    const a = computeSplits(records, policy);
    const b = computeSplits(records, policy);
    expect(a.splits).toEqual(b.splits);
    expect(a.splitHashes).toEqual(b.splitHashes);
    expect(a.counts).toEqual(b.counts);
  });

  it("is independent of input order", () => {
    const records = makeSplitRecords(100);
    const policy = defaultSplitPolicy();
    const forward = computeSplits(records, policy);
    const reversed = computeSplits([...records].reverse(), policy);
    expect(forward.splits).toEqual(reversed.splits);
    expect(forward.splitHashes).toEqual(reversed.splitHashes);
  });

  it("splits have no overlap and fully cover the input", () => {
    const records = makeSplitRecords(100);
    const { splits, counts } = computeSplits(records, defaultSplitPolicy());
    const all = [...splits.train, ...splits.validation, ...splits.test];
    expect(all).toHaveLength(100);
    expect(new Set(all).size).toBe(100);
    expect(all.sort()).toEqual(records.map((r) => r.id).sort());
    expect(counts).toEqual({ train: 80, validation: 10, test: 10 });
    expect(splits.train).toHaveLength(80);
  });

  it("changing the seed changes the assignment", () => {
    const records = makeSplitRecords(100);
    const a = computeSplits(records, defaultSplitPolicy(3407));
    const b = computeSplits(records, defaultSplitPolicy(9999));
    expect(a.splits.train).not.toEqual(b.splits.train);
  });

  it("per-split hashes are stable and reflect membership", () => {
    const records = makeSplitRecords(100);
    const { splits, splitHashes } = computeSplits(records, defaultSplitPolicy());
    const recomputedTrain = splitHashFromLineHashes(
      splits.train.map((id) => records.find((r) => r.id === id)!.lineHash),
    );
    expect(recomputedTrain).toBe(splitHashes.train);
  });

  it("fails loudly (EmptySplitError) when a split is below the minimum", () => {
    const records = makeSplitRecords(20); // 0.1 * 20 = 2 < default minimum of 10
    expect(() => computeSplits(records, defaultSplitPolicy())).toThrow(EmptySplitError);
  });

  it("rejects ratios that do not sum to 1.0", () => {
    const records = makeSplitRecords(100);
    const policy = defaultSplitPolicy();
    policy.ratios = { train: 0.8, validation: 0.1, test: 0.2 };
    expect(() => computeSplits(records, policy)).toThrow(/sum to 1/);
  });

  it("exposes a stable default seed", () => {
    expect(DEFAULT_SPLIT_SEED).toBe(3407);
    expect(defaultSplitPolicy().seed).toBe(3407);
    expect(defaultSplitPolicy().algorithm).toBe("seeded-shuffle-sha256");
  });
});

// ============================================================
// 3. Canonical Training Package
// ============================================================

describe("package.ts — content addressing", () => {
  it("package_id = sha256(canonical manifest with package_id='')", () => {
    const pkg = makeValidPackage();
    const manifest = toManifest(pkg);
    (manifest as Record<string, unknown>).package_id = "";
    expect(pkg.packageId).toBe(sha256Canonical(manifest));
    expect(isPackageIdValid(pkg)).toBe(true);
  });

  it("building the same package twice yields the same package_id", () => {
    expect(makeValidPackage().packageId).toBe(makeValidPackage().packageId);
  });

  it("a changed field yields a different package_id", () => {
    const a = makeValidPackage();
    const b = makeValidPackage({ experimentId: "GHARIBO-exp-002" });
    expect(a.packageId).not.toBe(b.packageId);
  });

  it("the manifest round-trips through serialize → parse", () => {
    const pkg = makeValidPackage();
    expect(parseManifest(serializeManifest(pkg))).toEqual(pkg);
  });

  it("toManifest is snake_case and self-describing", () => {
    const m = toManifest(makeValidPackage());
    expect(m).toHaveProperty("schema_version", "1.1.0");
    expect(m).toHaveProperty("package_id");
    expect(m).toHaveProperty("base_model_revision");
    expect((m as any).dataset).toHaveProperty(
      "record_format",
      "canonical-record-v1",
    );
    expect((m as any).dataset).toHaveProperty("split_hashes.train");
    expect((m as any).checkpoint_policy).toHaveProperty("save_strategy", "steps");
    expect((m as any).evaluation_config).toHaveProperty("status", "NOT_RUN");
  });

  it("preserves legacy 1.0 package content addressing", () => {
    const current = makeValidPackage();

    const legacy = finalizePackage({
      ...current,
      schemaVersion: "1.0.0",
    });

    const serialized = serializeManifest(legacy);

    expect(serialized).not.toContain("record_format");

    const parsed = parseManifest(serialized);

    expect(parsed.dataset.recordFormat).toBe(
      "canonical-record-v1",
    );
    expect(parsed.packageId).toBe(legacy.packageId);
    expect(isPackageIdValid(parsed)).toBe(true);
  });

  it("computePackageId ignores the stored package_id", () => {
    const pkg = makeValidPackage();
    const tampered = { ...pkg, packageId: "deadbeef" };
    expect(computePackageId(tampered)).toBe(computePackageId(pkg));
  });

  it("finalizePackage assigns a content address", () => {
    const { packageId, ...draft } = makeValidPackage();
    const finalized = finalizePackage(draft);
    expect(isSha256Hex(finalized.packageId)).toBe(true);
    expect(finalized.packageId).toBe(packageId);
  });
});

describe("package.ts — derivation from stored run columns", () => {
  const baseRun: TrainingRun = {
    runId: "run-1",
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
    targetModules: ["q_proj", "v_proj"],
    quantization: "4-bit",
    seed: 3407,
    device: null,
    status: "DRAFT",
    startTime: null,
    endTime: null,
    checkpointPath: null,
    logs: null,
    metrics: {},
    preflightResult: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  it("deriveLoRAFromRun returns null when rank/alpha/modules are absent", () => {
    expect(deriveLoRAFromRun({ ...baseRun, loraRank: null })).toBeNull();
    expect(deriveLoRAFromRun({ ...baseRun, loraAlpha: null })).toBeNull();
    expect(deriveLoRAFromRun({ ...baseRun, targetModules: [] })).toBeNull();
  });

  it("deriveLoRAFromRun maps stored columns", () => {
    expect(deriveLoRAFromRun(baseRun)).toEqual({
      r: 16,
      alpha: 32,
      targetModules: ["q_proj", "v_proj"],
      dropout: 0,
      bias: "none",
    });
  });

  it("deriveEpochs yields exactly one of epochs / max_steps", () => {
    expect(deriveEpochs({ ...baseRun, epochs: 3 })).toEqual({ epochs: 3, maxSteps: null });
    expect(deriveEpochs({ ...baseRun, epochs: null })).toEqual({ epochs: null, maxSteps: 30 });
  });
});

describe("validate.ts", () => {
  it("accepts a valid package with no blocking errors", () => {
    const issues = validatePackage(makeValidPackage());
    expect(hasBlockingErrors(issues)).toBe(false);
    expect(issues.filter((i) => i.level === "ERROR")).toEqual([]);
  });

  it("rejects an unsupported dataset record format", () => {
    const base = makeValidPackage();

    const pkg = makeValidPackage({
      dataset: {
        ...base.dataset,
        recordFormat: "unsupported-format" as any,
      },
    });

    const issues = validatePackage(pkg);

    expect(hasBlockingErrors(issues)).toBe(true);
    expect(formatIssues(issues)).toContain("dataset.record_format");
  });

  it("rejects a package whose package_id was tampered with", () => {
    const pkg = { ...makeValidPackage(), packageId: "0".repeat(64) };
    const issues = validatePackage(pkg);
    expect(hasBlockingErrors(issues)).toBe(true);
    expect(formatIssues(issues)).toContain("package_id");
  });

  it("rejects a non-4-bit quantization / non-QLoRA method / bf16 dtype", () => {
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ quantization: "8-bit" as any })))).toBe(true);
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ method: "LoRA" as any })))).toBe(true);
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ dtype: "bf16" as any })))).toBe(true);
  });

  it("rejects an unsupported sequence_length", () => {
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ sequenceLength: 2048 })))).toBe(true);
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ sequenceLength: 512 })))).toBe(false);
  });

  it("rejects when epochs and max_steps are both non-null (or both null)", () => {
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ epochs: 3, maxSteps: 30 })))).toBe(true);
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ epochs: null, maxSteps: null })))).toBe(true);
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ epochs: 3, maxSteps: null })))).toBe(false);
  });

  it("rejects a malformed git_commit_sha", () => {
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ gitCommitSha: "not-a-sha" })))).toBe(true);
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ gitCommitSha: "unknown" })))).toBe(false);
  });

  it("rejects a non-64-hex dataset/split hash", () => {
    const base = makeValidPackage();
    const pkg = makeValidPackage({ dataset: { ...base.dataset, datasetHash: "short" } });
    const issues = validatePackage(pkg);
    expect(hasBlockingErrors(issues)).toBe(true);
    expect(formatIssues(issues)).toContain("dataset_hash");
  });

  it("rejects a fabricated evaluation result", () => {
    const base = makeValidPackage();
    const pkg = makeValidPackage({
      evaluationConfig: { ...base.evaluationConfig, executed: true as any, status: "PASSED" as any },
    });
    const issues = validatePackage(pkg);
    expect(hasBlockingErrors(issues)).toBe(true);
    expect(formatIssues(issues)).toContain("evaluation_config");
  });

  it("rejects an hf destination that is not private / has no repo_id", () => {
    const pkg = makeValidPackage({
      artifactDestination: {
        kind: "hf",
        repoId: null,
        private: false,
        path: null,
        tokenSecretName: "HF_TOKEN",
      },
    });
    const issues = validatePackage(pkg);
    expect(hasBlockingErrors(issues)).toBe(true);
    expect(formatIssues(issues)).toMatch(/repo_id|private/);
  });

  it("rejects an unsupported schema major", () => {
    expect(hasBlockingErrors(validatePackage(makeValidPackage({ schemaVersion: "2.0.0" })))).toBe(true);
  });

  it("enforces split-count and dataset-status rules only when ctx is supplied", () => {
    const pkg = makeValidPackage();
    // No ctx → those rules are skipped (enforced by the export path instead).
    expect(hasBlockingErrors(validatePackage(pkg))).toBe(false);
    expect(
      hasBlockingErrors(validatePackage(pkg, { splitCounts: { train: 1, validation: 10, test: 10 } })),
    ).toBe(true);
    expect(
      hasBlockingErrors(validatePackage(pkg, { datasetStatus: "DRAFT" })),
    ).toBe(true);
  });

  it("warns (not errors) when the hidden analysis channel is missing", () => {
    const base = makeValidPackage();
    const pkg = makeValidPackage({
      harmony: { ...base.harmony, hiddenChannels: [] as any },
    });
    const issues = validatePackage(pkg);
    expect(hasBlockingErrors(issues)).toBe(false);
    expect(issues.some((i) => i.level === "WARN" && i.field === "harmony.hidden_channels")).toBe(true);
  });
});

// ============================================================
// 4. Harmony mapping
// ============================================================

describe("harmony.ts", () => {
  it("emits developer → user → (analysis) → final in order", () => {
    const msgs = renderHarmony(
      toCanonicalInput(makeRecord({ reasoning: "because", chosenOutput: "4" })),
      { developerTemplateId: "generic-structured-output", reasoningEffort: "medium", hiddenChannels: ["analysis"] },
    );
    expect(msgs.map((m) => `${m.role}${m.channel ? ":" + m.channel : ""}`)).toEqual([
      "developer",
      "user",
      "assistant:analysis",
      "assistant:final",
    ]);
    expect(msgs[2].content).toBe("because");
    expect(msgs[3].content).toBe("4");
  });

  it("omits the analysis channel when there is no reasoning", () => {
    const msgs = renderHarmony(toCanonicalInput(makeRecord({ reasoning: null })), {
      developerTemplateId: "generic-structured-output",
      reasoningEffort: "medium",
      hiddenChannels: ["analysis"],
    });
    expect(msgs.some((m) => m.channel === "analysis")).toBe(false);
  });

  it("appends context to the user message", () => {
    const msgs = renderHarmony(
      toCanonicalInput(makeRecord({ input: "Q?", context: "CTX" })),
      { developerTemplateId: "generic-structured-output", reasoningEffort: "medium", hiddenChannels: ["analysis"] },
    );
    expect(msgs[1].content).toBe("Q?\n\nContext:\nCTX");
  });

  it("falls back from chosen_output to expected_output for the final channel", () => {
    const msgs = renderHarmony(
      toCanonicalInput(makeRecord({ chosenOutput: null, expectedOutput: "fallback" })),
      { developerTemplateId: "generic-structured-output", reasoningEffort: "medium", hiddenChannels: ["analysis"] },
    );
    expect(msgs[msgs.length - 1].content).toBe("fallback");
  });

  it("resolves unknown framing ids to the generic default", () => {
    expect(resolveDeveloperFraming("does-not-exist")).toBe(resolveDeveloperFraming("generic-structured-output"));
  });
});

// ============================================================
// 5. ZIP writer
// ============================================================

interface ParsedZipEntry {
  name: string;
  method: number;
  crc: number;
  size: number;
  data: Buffer;
}

/** Minimal independent ZIP reader used to prove archive validity. */
function parseZip(bytes: Uint8Array): ParsedZipEntry[] {
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("EOCD not found");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const entries: ParsedZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central directory signature");
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString("utf8");
    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("bad local header signature");
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    entries.push({ name, method, crc, size, data: buf.subarray(dataStart, dataStart + size) });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

describe("zip.ts", () => {
  const entries: ZipEntry[] = [
    { path: "manifest.json", content: '{"a":1}' },
    { path: "dataset/train.jsonl", content: "line1\nline2\n" },
  ];

  it("crc32 matches the standard IEEE check value", () => {
    expect(crc32(Buffer.from("123456789", "utf8"))).toBe(0xcbf43926);
  });

  it("produces a structurally valid, store-only archive", () => {
    const parsed = parseZip(createZip(entries));
    expect(parsed.map((e) => e.name).sort()).toEqual(["dataset/train.jsonl", "manifest.json"]);
    for (const e of parsed) {
      expect(e.method).toBe(0); // store, no deflate
      expect(crc32(e.data)).toBe(e.crc);
      expect(e.size).toBe(e.data.length);
    }
    const manifest = parsed.find((e) => e.name === "manifest.json")!;
    expect(manifest.data.toString("utf8")).toBe('{"a":1}');
  });

  it("is byte-identical for identical input (deterministic timestamp)", () => {
    expect(Buffer.from(createZip(entries))).toEqual(Buffer.from(createZip(entries)));
  });

  it("is a real archive readable by a system archive tool", () => {
    const zipPath = path.join(os.tmpdir(), `gharibo-m2-zip-${Date.now()}.zip`);
    fs.writeFileSync(zipPath, Buffer.from(createZip(entries)));
    try {
      const unzip = spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
      const unzipMissing =
        (unzip.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";

      if (unzipMissing) {
        // Windows does not ship the Unix `unzip` executable by default.
        // bsdtar/tar can validate and enumerate ZIP archives and is available
        // on supported Windows installations.
        const tar = spawnSync("tar", ["-tf", zipPath], { encoding: "utf8" });

        expect(tar.error).toBeUndefined();
        expect(tar.status).toBe(0);
        expect(tar.stdout).toContain("manifest.json");
      } else {
        expect(unzip.error).toBeUndefined();
        expect(unzip.status).toBe(0);
        expect(unzip.stdout).toContain("No errors detected");
      }
    } finally {
      fs.rmSync(zipPath, { force: true });
    }
  });
});
