/**
 * Post-training lifecycle + artifact-registry tests (DEC-0030 reconciliation).
 *
 * The first real external run finished on Kaggle, so the database had to be
 * reconciled from QUEUED to COMPLETED. That reconciliation is only legitimate
 * because completion evidence exists (see `m2-gold-execution-acceptance`); what
 * these tests freeze is that the LIFECYCLE itself was still honoured:
 *
 *   - a run cannot be jumped straight from QUEUED to COMPLETED,
 *   - COMPLETED is terminal,
 *   - the audit log records the transition at the time it really happened, not
 *     at the moment bookkeeping caught up,
 *   - timestamps and metrics are the real ones,
 *   - the artifact registry holds model artifacts only.
 *
 * Runs against an isolated temp SQLite file — never `apps/web/data/gharibo.db`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// Point the DB singleton at a throwaway temp file BEFORE any import reads config.
const dbPath = vi.hoisted(() => {
  const base = process.env.TEMP || process.env.TMPDIR || process.cwd();
  const dir = `${base}/gharibo-post-training-test-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const p = `${dir}/test.db`;
  process.env.DATABASE_PATH = p;
  return p;
});

import type { TrainingRun } from "@gharibo/shared";
import {
  trainingArtifactsRepository,
  trainingRunEventsRepository,
  trainingRunsRepository,
} from "@/lib/db/repositories";
import { NON_ARTIFACT_PREFIXES } from "@/lib/db/repositories/training-artifacts";
import { closeDb, db } from "@/lib/db/index";

const PACKAGE_ID =
  "78dd1bf374ed1c53785ea50bf179b1b7a4764d40c121d3d41cda4e2a2e3e68f2";
const ROLLUP =
  "788bc0a77d465bcbc997e8698177fbd90c9e8e2720e549159a27684095284885";

function runInput(): Omit<TrainingRun, "runId" | "createdAt" | "updatedAt" | "status"> {
  return {
    baseModel: "openai/gpt-oss-20b",
    method: "qlora" as const,
    datasetId: null,
    datasetVersion:
      "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
    trainExamples: 640,
    validationExamples: 80,
    epochs: 1,
    learningRate: 0.0002,
    batchSize: 1,
    gradientAccumulation: 4,
    loraRank: 16,
    loraAlpha: 32,
    targetModules: ["q_proj", "v_proj"],
    quantization: "4-bit",
    seed: 42,
    device: null,
    startTime: null,
    endTime: null,
    checkpointPath: null,
    logs: null,
    metrics: {},
    preflightResult: null,
  };
}

/** Captures the HttpError thrown by a repository call. */
function capture(fn: () => unknown): { code: number; message: string } | null {
  try {
    fn();
    return null;
  } catch (error) {
    return error as { code: number; message: string };
  }
}

/** Walks a fresh run to QUEUED, the state DEC-0026 left the real run in. */
function queuedRun(): TrainingRun {
  const run = trainingRunsRepository.create(runInput() as never);
  return trainingRunsRepository.transition(run.runId, "QUEUED", {
    source: "DEC-0026",
    reason: "execution authorized",
  })!;
}

afterAll(() => {
  closeDb();
});

describe("post-training lifecycle — no jumping QUEUED → COMPLETED", () => {
  it("rejects QUEUED → COMPLETED: a run must be observed RUNNING first", () => {
    const run = queuedRun();
    const err = capture(() =>
      trainingRunsRepository.transition(run.runId, "COMPLETED", { source: "DEC-0030" }),
    );
    expect(err).not.toBeNull();
    expect(err!.code).toBe(400);
    expect(err!.message).toMatch(/Illegal transition QUEUED → COMPLETED/);
    expect(trainingRunsRepository.get(run.runId)!.status).toBe("QUEUED");
  });

  it("rejects QUEUED → FAILED for the same reason (no silent terminal shortcut)", () => {
    const run = queuedRun();
    const err = capture(() =>
      trainingRunsRepository.transition(run.runId, "FAILED", { source: "DEC-0030" }),
    );
    expect(err).not.toBeNull();
    expect(err!.code).toBe(400);
  });

  it("walks QUEUED → RUNNING → COMPLETED and audits every step", () => {
    const run = queuedRun();
    trainingRunsRepository.transition(run.runId, "RUNNING", { source: "DEC-0030" });
    const completed = trainingRunsRepository.transition(run.runId, "COMPLETED", {
      source: "DEC-0030",
    })!;
    expect(completed.status).toBe("COMPLETED");

    const events = trainingRunEventsRepository.listByRun(run.runId);
    expect(events.map((e) => `${e.fromStatus}->${e.toStatus}`)).toEqual([
      "DRAFT->QUEUED",
      "QUEUED->RUNNING",
      "RUNNING->COMPLETED",
    ]);
    // The historical authorization event is preserved, not rewritten.
    expect(events[0].source).toBe("DEC-0026");
  });

  it("treats the reconciled COMPLETED status as terminal", () => {
    const run = queuedRun();
    trainingRunsRepository.transition(run.runId, "RUNNING", { source: "DEC-0030" });
    trainingRunsRepository.transition(run.runId, "COMPLETED", { source: "DEC-0030" });
    for (const to of ["RUNNING", "QUEUED", "FAILED", "INTERRUPTED"] as const) {
      expect(
        capture(() => trainingRunsRepository.transition(run.runId, to, { source: "test" })),
        `${to} must be rejected from COMPLETED`,
      ).not.toBeNull();
    }
  });
});

describe("post-training lifecycle — real timestamps and metrics", () => {
  it("records externally-observed transition times, not bookkeeping time", () => {
    const run = queuedRun();
    const observedRunningAt = "2026-09-15T18:36:27Z";
    const derivedCompletedAt = "2026-09-15T19:47:46.274Z";

    trainingRunsRepository.transition(run.runId, "RUNNING", { source: "DEC-0030" });
    trainingRunsRepository.transition(run.runId, "COMPLETED", { source: "DEC-0030" });

    // Backfill the two reconciliation events with the real external times.
    for (const [toStatus, createdAt] of [
      ["RUNNING", observedRunningAt],
      ["COMPLETED", derivedCompletedAt],
    ] as const) {
      const event = trainingRunEventsRepository
        .listByRun(run.runId)
        .find((e) => e.toStatus === toStatus && e.source === "DEC-0030")!;
      expect(event).toBeDefined();
      expect(event.createdAt).not.toBe(createdAt); // appended with now()
    }

    // The repository can append an event at its true time.
    const backfilled = trainingRunEventsRepository.append({
      runId: run.runId,
      fromStatus: "RUNNING",
      toStatus: "COMPLETED",
      source: "DEC-0030-reconciliation",
      reason: "external completion observed",
      createdAt: derivedCompletedAt,
    });
    expect(backfilled.createdAt).toBe(derivedCompletedAt);
  });

  it("persists real start/end times independently of updated_at", () => {
    const run = queuedRun();
    trainingRunsRepository.setTimes(run.runId, {
      startTime: "2026-09-15T18:35:56.230Z",
    });
    trainingRunsRepository.transition(run.runId, "RUNNING", { source: "DEC-0030" });
    trainingRunsRepository.transition(run.runId, "COMPLETED", { source: "DEC-0030" });
    const finished = trainingRunsRepository.setTimes(run.runId, {
      endTime: "2026-09-15T19:47:46.274Z",
    })!;

    expect(finished.startTime).toBe("2026-09-15T18:35:56.230Z");
    expect(finished.endTime).toBe("2026-09-15T19:47:46.274Z");
    expect(finished.updatedAt).not.toBe(finished.startTime);
    expect(Date.parse(finished.endTime!) - Date.parse(finished.startTime!)).toBeGreaterThan(0);
  });

  it("persists the real training metrics", () => {
    const run = queuedRun();
    const metrics = {
      source: "kaggle-external-result",
      trainExamples: 640,
      globalStep: 160,
      totalSteps: 160,
      trainLoss: 0.6016419500112533,
      trainRuntimeSeconds: 4041.9648,
      trainableParameters: 3981312,
      declaredDtype: "fp16",
      effectiveDtype: "float32",
      evaluationStatus: "NOT_RUN",
      promoted: false,
    };
    const saved = trainingRunsRepository.setMetrics(run.runId, metrics)!;
    expect(saved.metrics).toEqual(metrics);
    expect(trainingRunsRepository.get(run.runId)!.metrics.trainLoss).toBe(
      0.6016419500112533,
    );
  });
});

describe("artifact registry — model artifacts only", () => {
  const rows = [
    {
      relativePath: "outputs/final/adapter_model.safetensors",
      kind: "final_adapter",
      sha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
      sizeBytes: 15938048,
    },
    {
      relativePath: "outputs/checkpoint-160/adapter_model.safetensors",
      kind: "checkpoint_160",
      sha256: "794917f25c4aa9e77acb6a746b69a703412539e9939f6bfc1e8c602d64be678f",
      sizeBytes: 15938048,
    },
    {
      relativePath: "outputs/checkpoint-150/adapter_model.safetensors",
      kind: "checkpoint_150",
      sha256: "5e062fa0bbba3c5276e3d6086f8e7dc0a7e1605c2dbf8c1d989ecbfe5a140249",
      sizeBytes: 15938048,
    },
    {
      relativePath: "outputs/trainer_state.json",
      kind: "trainer_state",
      sha256: "5be2b5f14089d19721a4ab230c687ea473db4dc875c808695329d47fac4da258",
      sizeBytes: 26519,
    },
  ];

  beforeAll(() => {
    // `training_artifacts.package_id` is a foreign key, so the issued package the
    // artifacts belong to has to exist in the temp database first.
    db().prepare(
      `INSERT OR IGNORE INTO training_packages
       (id, experiment_id, schema_version, manifest, manifest_hash, run_id, worker_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      PACKAGE_ID,
      "GHARIBO-exp-001",
      "1.0.0",
      "{}",
      "0".repeat(64),
      null,
      "kaggle",
      "2026-09-15T16:47:40.759Z",
    );
    trainingArtifactsRepository.replaceForPackage(PACKAGE_ID, rows, ROLLUP);
  });

  it("stores kind, path, sha256, size and the manifest rollup", () => {
    const stored = trainingArtifactsRepository.listByPackage(PACKAGE_ID);
    expect(stored).toHaveLength(rows.length);
    for (const row of stored) {
      expect(row.packageId).toBe(PACKAGE_ID);
      expect(row.rollupHash).toBe(ROLLUP);
      expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(row.sizeBytes).toBeGreaterThan(0);
      expect(row.kind.length).toBeGreaterThan(0);
    }
    expect(stored.map((r) => r.relativePath).sort()).toEqual(
      rows.map((r) => r.relativePath).sort(),
    );
  });

  it("replaces prior rows instead of accumulating duplicates", () => {
    trainingArtifactsRepository.replaceForPackage(PACKAGE_ID, rows.slice(0, 2), ROLLUP);
    expect(trainingArtifactsRepository.listByPackage(PACKAGE_ID)).toHaveLength(2);
    // Restore the full registry for any later assertion.
    trainingArtifactsRepository.replaceForPackage(PACKAGE_ID, rows, ROLLUP);
    expect(trainingArtifactsRepository.listByPackage(PACKAGE_ID)).toHaveLength(4);
  });

  it("scopes rows to their package", () => {
    expect(trainingArtifactsRepository.listByPackage("some-other-package")).toHaveLength(0);
  });

  it("refuses to register the Unsloth compiled cache as a model artifact", () => {
    expect(NON_ARTIFACT_PREFIXES).toContain("unsloth_compiled_cache/");
    const err = capture(() =>
      trainingArtifactsRepository.replaceForPackage(
        PACKAGE_ID,
        [
          ...rows,
          {
            relativePath: "unsloth_compiled_cache/compiled_module.pt",
            kind: "cache",
            sha256: "0".repeat(64),
            sizeBytes: 1024,
          },
        ],
        ROLLUP,
      ),
    );
    expect(err).not.toBeNull();
    expect(err!.code).toBe(400);
    expect(err!.message).toMatch(/not a model artifact/);
    // The rejection is atomic — the registry is untouched.
    expect(trainingArtifactsRepository.listByPackage(PACKAGE_ID)).toHaveLength(4);
  });
});
