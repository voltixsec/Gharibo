/**
 * M2 repository tests (architecture M2 §6, §7, §10) — run against an ISOLATED
 * temp SQLite file (never `apps/web/data/gharibo.db`).
 *
 * Covers the server-side gating + content-addressing invariants:
 *  - training-packages.create() idempotency (immutable, content-addressed)
 *  - datasets.cutVersion() content-addressed dedupe + deterministic splits
 *  - model-registry.promote() transition + forbidden-name gating
 *  - data-factory.transition() Gold Pipeline gating
 *  - training-runs.transition() resilience state machine + audit events
 *  - export.ts byte-identical re-assembly (ADR-0012 immutability)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Point the DB singleton at a throwaway temp file BEFORE any import reads config.
const dbPath = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMPDIR || process.cwd();
  const dir = `${base}/gharibo-m2-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const p = `${dir}/test.db`;
  process.env.DATABASE_PATH = p;
  return p;
});

import type {
  BundleFile,
  DatasetWithSplits,
  SplitName,
  TrainingRun,
  VerificationStatus,
} from "@gharibo/shared";
import {
  dataFactoryRepository,
  datasetsRepository,
  evaluationsRepository,
  modelRegistryRepository,
  trainingPackagesRepository,
  trainingRunEventsRepository,
  trainingRunsRepository,
} from "@/lib/db/repositories";
import { closeDb } from "@/lib/db/index";
import { serializeManifest } from "@/lib/training/package";
import { defaultSplitPolicy } from "@/lib/training/split";
import { canonicalLine, recordLineHash, splitHashFromLineHashes, toCanonicalInput } from "@/lib/training/canonical";
import { assembleBundleForPackage, buildPackageForRun } from "@/lib/training/export";
import { makeRecord, makeValidPackage, toDataFactoryInput } from "./_m2-fixtures";

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/** Runs `fn` and returns the thrown error (or null if it did not throw). */
function capture(fn: () => unknown): any {
  try {
    fn();
    return null;
  } catch (e) {
    return e;
  }
}

/**
 * Split membership is a SET; the repository does not promise intra-split ordering
 * (see the coverage note in the QA report). Compare membership, not order.
 */
function sortedSplits(s: Record<SplitName, string[]>): Record<SplitName, string[]> {
  return {
    train: [...s.train].sort(),
    validation: [...s.validation].sort(),
    test: [...s.test].sort(),
  };
}

/** Seeds N TRAINING_READY Data Factory records; returns their ids. */
function seedReadyRecords(n: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const input = toDataFactoryInput(
      makeRecord({
        input: `Question ${i}`,
        chosenOutput: `Answer ${i}`,
        verificationStatus: "TRAINING_READY",
      }),
    );
    ids.push(dataFactoryRepository.create(input).id);
  }
  return ids;
}

/** Minimal valid training-run create input. */
function runInput(overrides: Partial<Omit<TrainingRun, "runId" | "createdAt" | "updatedAt" | "status">> = {}) {
  return {
    baseModel: "openai/gpt-oss-20b",
    method: "qlora" as const,
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
    ...overrides,
  };
}

/** Minimal valid model-registry create input. */
function modelInput(overrides: Record<string, unknown> = {}) {
  return {
    modelName: "gharibo-exp-001",
    version: "v1",
    baseModel: "openai/gpt-oss-20b",
    trainingRunId: null,
    datasetVersion: null,
    trainingMethod: "qlora",
    checkpointLocation: null,
    adapterLocation: null,
    evaluationScore: {},
    status: "EXPERIMENT" as const,
    notes: null,
    ...overrides,
  } as Parameters<typeof modelRegistryRepository.create>[0];
}

afterAll(() => {
  closeDb();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

// ============================================================
// training-packages — immutability / idempotency
// ============================================================

describe("training-packages repository", () => {
  it("create() is idempotent: identical content is a no-op and never replaced", () => {
    const manifest = serializeManifest(makeValidPackage({ experimentId: "exp-A" }));
    const args = {
      manifest,
      datasetId: null,
      datasetVersionId: null,
      runId: null,
      notebookSha256: null,
      bundlePath: null,
    };
    const first = trainingPackagesRepository.create({ ...args, experimentId: "exp-A" });
    const second = trainingPackagesRepository.create({ ...args, experimentId: "exp-B" });

    expect(second.id).toBe(first.id);
    expect(second.experimentId).toBe("exp-A"); // NOT overwritten
    expect(second.createdAt).toBe(first.createdAt);
    expect(trainingPackagesRepository.list().filter((p) => p.experimentId === "exp-B")).toHaveLength(0);
  });

  it("content-addresses across JSON key ordering (canonicalised)", () => {
    const pkg = makeValidPackage({ experimentId: "exp-C" });
    const canonical = serializeManifest(pkg);
    const parsed = JSON.parse(canonical);
    // Reorder ONLY the top level (a replacer array would drop nested keys).
    const reordered = `{${Object.keys(parsed)
      .reverse()
      .map((k) => `${JSON.stringify(k)}:${JSON.stringify(parsed[k])}`)
      .join(",")}}`;
    expect(JSON.parse(reordered)).toEqual(parsed); // same content, different byte order

    const args = {
      experimentId: "exp-C",
      datasetId: null,
      datasetVersionId: null,
      runId: null,
      notebookSha256: null,
      bundlePath: null,
    };
    const a = trainingPackagesRepository.create({ ...args, manifest: canonical });
    const b = trainingPackagesRepository.create({ ...args, manifest: reordered });
    expect(b.id).toBe(a.id);
    expect(b.manifest).toBe(a.manifest); // stored manifest unchanged
  });

  it("id equals the recomputed content address and round-trips to the same package", () => {
    const pkg = makeValidPackage({ experimentId: "exp-D" });
    const row = trainingPackagesRepository.create({
      manifest: serializeManifest(pkg),
      experimentId: "exp-D",
      datasetId: null,
      datasetVersionId: null,
      runId: null,
      notebookSha256: null,
      bundlePath: null,
    });
    expect(row.id).toBe(pkg.packageId);
    expect(row.manifestHash).toBe(pkg.packageId);
    expect(row.schemaVersion).toBe("1.0.0");
  });
});

// ============================================================
// datasets — content-addressed cut + deterministic splits
// ============================================================

describe("datasets repository", () => {
  const policy = defaultSplitPolicy(3407, 2);
  let ids!: string[];
  let cut!: DatasetWithSplits;

  beforeAll(() => {
    ids = seedReadyRecords(20);
    cut = datasetsRepository.cutVersion({ name: "ds-test", recordIds: ids, splitPolicy: policy });
  });

  it("cuts a TRAINING_READY, content-addressed version", () => {
    expect(cut.status).toBe("TRAINING_READY");
    expect(cut.datasetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(cut.datasetVersionId).toBe(cut.datasetHash);
    expect(cut.recordCount).toBe(20);
    expect(cut.splitPolicy).toEqual(policy);
  });

  it("splits have no overlap and fully cover the input", () => {
    const all = [...cut.splits.train, ...cut.splits.validation, ...cut.splits.test];
    expect(all).toHaveLength(20);
    expect(new Set(all).size).toBe(20);
    expect(all.sort()).toEqual([...ids].sort());
  });

  it("split hashes are stable and derived from record content", () => {
    const hashes = cut.splitHashes!;
    const lineHashOf = (id: string) => recordLineHash(toCanonicalInput(dataFactoryRepository.get(id)!));
    expect(hashes.train).toBe(splitHashFromLineHashes(cut.splits.train.map(lineHashOf)));
    expect(hashes.validation).toBe(splitHashFromLineHashes(cut.splits.validation.map(lineHashOf)));
    expect(hashes.test).toBe(splitHashFromLineHashes(cut.splits.test.map(lineHashOf)));
  });

  it("re-cutting identical content reuses the same version (no new row)", () => {
    const again = datasetsRepository.cutVersion({
      name: "ds-test",
      recordIds: [...ids].reverse(), // order must not matter
      splitPolicy: policy,
    });
    expect(again.id).toBe(cut.id);
    expect(again.datasetHash).toBe(cut.datasetHash);
    expect(sortedSplits(again.splits)).toEqual(sortedSplits(cut.splits));
    expect(datasetsRepository.list().filter((d) => d.datasetHash === cut.datasetHash)).toHaveLength(1);
  });

  it("getByHash / getSplits return the persisted version", () => {
    expect(datasetsRepository.getByHash(cut.datasetHash!)!.id).toBe(cut.id);
    expect(sortedSplits(datasetsRepository.getSplits(cut.id))).toEqual(sortedSplits(cut.splits));
  });

  it("refuses to cut a version containing a non-TRAINING_READY record", () => {
    const rawId = dataFactoryRepository.create(
      toDataFactoryInput(makeRecord({ input: "raw record", verificationStatus: "RAW" })),
    ).id;
    const err = capture(() =>
      datasetsRepository.cutVersion({ name: "ds-bad", recordIds: [...ids, rawId], splitPolicy: policy }),
    );
    expect(err).not.toBeNull();
    expect(String(err.message)).toMatch(/not TRAINING_READY/);
  });

  it("refuses to cut a version with a missing record", () => {
    const err = capture(() =>
      datasetsRepository.cutVersion({ name: "ds-missing", recordIds: ["does-not-exist"], splitPolicy: policy }),
    );
    expect(err).not.toBeNull();
    expect(String(err.message)).toMatch(/not found/);
  });
});

// ============================================================
// model-registry — server-side gated promotion
// ============================================================

describe("model-registry repository", () => {
  it("blocks forbidden names/versions at create()", () => {
    expect(capture(() => modelRegistryRepository.create(modelInput({ modelName: "GHARIBO-V1" })))).not.toBeNull();
    expect(capture(() => modelRegistryRepository.create(modelInput({ version: "GHARIBO-V0.1" })))).not.toBeNull();
    expect(capture(() => modelRegistryRepository.create(modelInput({ modelName: "GHARIBO-V0.1" })))).not.toBeNull();
  });

  it("rejects an illegal transition EXPERIMENT → ACCEPTED", () => {
    const entry = modelRegistryRepository.create(modelInput({ modelName: "exp-illegal", version: "v1" }));
    const err = capture(() => modelRegistryRepository.promote(entry.id, "ACCEPTED"));
    expect(err).not.toBeNull();
    expect(err.code).toBe(400);
    expect(String(err.message)).toMatch(/Illegal registry transition EXPERIMENT → ACCEPTED/);
  });

  it("rejects EXPERIMENT → CANDIDATE without a training-run reference", () => {
    const entry = modelRegistryRepository.create(modelInput({ modelName: "exp-noRun", version: "v1" }));
    const err = capture(() => modelRegistryRepository.promote(entry.id, "CANDIDATE"));
    expect(err).not.toBeNull();
    expect(err.code).toBe(400);
    expect(String(err.message)).toMatch(/no training-run reference/);
  });

  it("rejects EXPERIMENT → CANDIDATE without any evaluation result", () => {
    const run = trainingRunsRepository.create(runInput());
    const entry = modelRegistryRepository.create(
      modelInput({ modelName: "exp-noEval", version: "v1", trainingRunId: run.runId }),
    );
    const err = capture(() => modelRegistryRepository.promote(entry.id, "CANDIDATE"));
    expect(err).not.toBeNull();
    expect(err.code).toBe(400);
    expect(String(err.message)).toMatch(/at least one evaluation result/);
  });

  it("allows EXPERIMENT → CANDIDATE once a run + evaluation exist", () => {
    const run = trainingRunsRepository.create(runInput());
    const entry = modelRegistryRepository.create(
      modelInput({ modelName: "exp-ok", version: "v1", trainingRunId: run.runId }),
    );
    evaluationsRepository.create({
      modelId: entry.id,
      benchmarkCategory: "Reasoning",
      score: 0.5,
      baseModelScore: 0.4,
      regressions: [],
    });
    const promoted = modelRegistryRepository.promote(entry.id, "CANDIDATE");
    expect(promoted!.status).toBe("CANDIDATE");
  });

  it("rejects CANDIDATE → ACCEPTED when a critical regression is recorded", () => {
    const run = trainingRunsRepository.create(runInput());
    const entry = modelRegistryRepository.create(
      modelInput({ modelName: "exp-regress", version: "v1", trainingRunId: run.runId }),
    );
    evaluationsRepository.create({
      modelId: entry.id,
      benchmarkCategory: "Reasoning",
      score: 0.5,
      baseModelScore: 0.4,
      regressions: [],
    });
    modelRegistryRepository.promote(entry.id, "CANDIDATE");
    evaluationsRepository.create({
      modelId: entry.id,
      benchmarkCategory: "Structured Output",
      score: 0.1,
      baseModelScore: 0.5,
      regressions: ["CRITICAL: schema correctness regression"],
    });
    const err = capture(() => modelRegistryRepository.promote(entry.id, "ACCEPTED"));
    expect(err).not.toBeNull();
    expect(err.code).toBe(400);
    expect(String(err.message)).toMatch(/critical regression/);
  });

  it("promote() returns null for an unknown id", () => {
    expect(modelRegistryRepository.promote("no-such-model", "CANDIDATE")).toBeNull();
  });
});

// ============================================================
// data-factory — server-side Gold Pipeline gating
// ============================================================

describe("data-factory repository — transitions", () => {
  function makeRaw(input: string) {
    return dataFactoryRepository.create(
      toDataFactoryInput(makeRecord({ input, verificationStatus: "RAW" })),
    );
  }

  it("rejects an illegal jump RAW → APPROVED", () => {
    const rec = makeRaw("jump");
    const err = capture(() => dataFactoryRepository.transition(rec.id, "APPROVED"));
    expect(err).not.toBeNull();
    expect(err.code).toBe(400);
    expect(String(err.message)).toMatch(/Illegal pipeline transition RAW → APPROVED/);
  });

  it("allows the full Gold Pipeline path RAW → … → TRAINING_READY", () => {
    const rec = makeRaw("happy path");
    const path: VerificationStatus[] = ["NORMALIZED", "REVIEW_REQUIRED", "APPROVED", "TRAINING_READY"];
    let current = rec;
    for (const to of path) {
      current = dataFactoryRepository.transition(current.id, to);
      expect(current.verificationStatus).toBe(to);
    }
    // Terminal state: no further transitions.
    expect(capture(() => dataFactoryRepository.transition(current.id, "NORMALIZED"))).not.toBeNull();
  });

  it("allows REVIEW_REQUIRED → REJECTED", () => {
    const rec = makeRaw("reject me");
    dataFactoryRepository.transition(rec.id, "NORMALIZED");
    dataFactoryRepository.transition(rec.id, "REVIEW_REQUIRED");
    const rejected = dataFactoryRepository.transition(rec.id, "REJECTED");
    expect(rejected.verificationStatus).toBe("REJECTED");
  });

  it("throws 404 for an unknown record", () => {
    const err = capture(() => dataFactoryRepository.transition("nope", "NORMALIZED"));
    expect(err).not.toBeNull();
    expect(err.code).toBe(404);
  });

  it("records pipeline_updated_at on a successful transition", () => {
    const rec = makeRaw("audit");
    const after = dataFactoryRepository.transition(rec.id, "NORMALIZED");
    expect(after.pipelineUpdatedAt).toBeTruthy();
  });
});

// ============================================================
// training-runs — resilience state machine + audit log
// ============================================================

describe("training-runs repository — transitions", () => {
  it("rejects an illegal transition DRAFT → RUNNING", () => {
    const run = trainingRunsRepository.create(runInput());
    const err = capture(() => trainingRunsRepository.transition(run.runId, "RUNNING", { source: "test" }));
    expect(err).not.toBeNull();
    expect(err.code).toBe(400);
    expect(String(err.message)).toMatch(/Illegal transition DRAFT → RUNNING/);
  });

  it("walks DRAFT → QUEUED → RUNNING → INTERRUPTED → RESUMABLE and audits each step", () => {
    const run = trainingRunsRepository.create(runInput());
    const steps: Array<TrainingRun["status"]> = ["QUEUED", "RUNNING", "INTERRUPTED", "RESUMABLE"];
    let current = run;
    for (const to of steps) {
      current = trainingRunsRepository.transition(current.runId, to, { source: "test", reason: `to ${to}` })!;
      expect(current.status).toBe(to);
    }
    const events = trainingRunEventsRepository.listByRun(run.runId);
    expect(events.map((e) => e.toStatus)).toEqual(steps);
    expect(events.map((e) => e.fromStatus)).toEqual(["DRAFT", "QUEUED", "RUNNING", "INTERRUPTED"]);
    expect(events.every((e) => e.source === "test")).toBe(true);
  });

  it("RESUMABLE → QUEUED is allowed (a resume issues a new run attempt)", () => {
    const run = trainingRunsRepository.create(runInput());
    trainingRunsRepository.transition(run.runId, "QUEUED", { source: "test" });
    trainingRunsRepository.transition(run.runId, "RUNNING", { source: "test" });
    trainingRunsRepository.transition(run.runId, "INTERRUPTED", { source: "test" });
    trainingRunsRepository.transition(run.runId, "RESUMABLE", { source: "test" });
    const requeued = trainingRunsRepository.transition(run.runId, "QUEUED", { source: "test" });
    expect(requeued!.status).toBe("QUEUED");
  });

  it("treats COMPLETED as terminal", () => {
    const run = trainingRunsRepository.create(runInput());
    trainingRunsRepository.transition(run.runId, "QUEUED", { source: "test" });
    trainingRunsRepository.transition(run.runId, "RUNNING", { source: "test" });
    trainingRunsRepository.transition(run.runId, "COMPLETED", { source: "test" });
    expect(capture(() => trainingRunsRepository.transition(run.runId, "QUEUED", { source: "test" }))).not.toBeNull();
  });

  it("setPackage and setResumeFromCheckpoint persist their values", () => {
    const run = trainingRunsRepository.create(runInput());
    expect(trainingRunsRepository.setPackage(run.runId, "pkg-abc")!.packageId).toBe("pkg-abc");
    expect(trainingRunsRepository.setResumeFromCheckpoint(run.runId, "outputs/checkpoint-50")!.resumeFromCheckpoint).toBe(
      "outputs/checkpoint-50",
    );
  });

  it("transition() returns null for an unknown run", () => {
    expect(trainingRunsRepository.transition("no-such-run", "QUEUED", { source: "test" })).toBeNull();
  });
});

// ============================================================
// export.ts — byte-identical re-assembly (ADR-0012 immutability)
// ============================================================

describe("export orchestration — byte-identical re-assembly", () => {
  const fileHashes = (files: BundleFile[]): Record<string, string> =>
    Object.fromEntries(files.map((f) => [f.relativePath, f.sha256]));
  const checksums = (files: BundleFile[]): string =>
    files.find((f) => f.relativePath.endsWith("CHECKSUMS.sha256"))!.content;

  it("buildPackageForRun (fresh cut) and assembleBundleForPackage emit identical bytes", () => {
    // A DRAFT dataset forces buildPackageForRun down the FRESH-CUT path — the path
    // that previously returned hash-sorted splits while re-assembly returned SQLite
    // index order, yielding a different train.jsonl hash and CHECKSUMS rollup.
    // The default export split policy requires >= 10 records per split.
    const ids = seedReadyRecords(100);
    const draft = datasetsRepository.create("ds-export-fresh", ids);
    const run = trainingRunsRepository.create(runInput({ seed: 3407 }));

    const built = buildPackageForRun({
      experimentId: "exp-export-fresh",
      runId: run.runId,
      datasetId: draft.id,
    });
    expect(built.files).toHaveLength(8);

    // Re-assemble the SAME issued package from its persisted row.
    const row = trainingPackagesRepository.get(built.packageRow.id)!;
    const reassembled = assembleBundleForPackage(row);

    expect(fileHashes(reassembled.files)).toEqual(fileHashes(built.files));
    expect(checksums(reassembled.files)).toBe(checksums(built.files));
    // The ZIP is a pure function of the file set, so it must be byte-identical too.
    expect(reassembled.zip).toEqual(built.zip);

    // And the emitted JSONL line order is exactly the canonical getSplits order
    // (this is the invariant the fix establishes for the fresh-cut path).
    const trainIds = datasetsRepository.getSplits(built.pkg.dataset.datasetId).train;
    const expectedLines = trainIds.map((id) =>
      canonicalLine(toCanonicalInput(dataFactoryRepository.get(id)!)),
    );
    const train = built.files.find((f) => f.relativePath.endsWith("dataset/train.jsonl"))!;
    expect(train.content).toBe(expectedLines.join("\n") + "\n");
  });
});
