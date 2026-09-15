/**
 * M2 worker-abstraction tests (architecture M2 §2, §9, §10).
 *
 * Covers:
 *  - deterministic notebook rendering + secret hygiene (no real HF token)
 *  - the Kaggle bundle layout + CHECKSUMS rollup
 *  - worker registry / capabilities
 *  - planResume (resumable vs fresh) and normalizeStatus mapping
 *
 * Pure modules — no DB, no network, no GPU.
 */
import { describe, it, expect } from "vitest";

import { TRAINING_WORKERS, getTrainingWorker, type BundleDatasetContents } from "@/lib/workers";
import { kaggleTrainingWorker, KAGGLE_CAPABILITIES, planResume } from "@/lib/workers/kaggle";
import {
  PACKAGE_SENTINEL,
  loadNotebookTemplate,
  renderNotebook,
} from "@/lib/workers/kaggle/notebook-render";
import { buildBundle, buildChecksumsFile, bundleRoot } from "@/lib/workers/kaggle/bundle";
import { normalizeStatus } from "@/lib/workers/kaggle/status";
import { instructions, renderReadme, HF_TOKEN_SECRET_NAME } from "@/lib/workers/kaggle/instructions";
import { deriveCheckpointPolicy } from "@/lib/training/package";
import { artifactRollup } from "@/lib/training/hash";
import { validatePackage, hasBlockingErrors } from "@/lib/training/validate";
import type { TrainingRun } from "@gharibo/shared";
import { makeValidPackage } from "./_m2-fixtures";

const HF_DESTINATION_PKG = makeValidPackage({
  artifactDestination: {
    kind: "hf",
    repoId: "gharibo/experiment-001-adapter",
    private: true,
    path: null,
    tokenSecretName: HF_TOKEN_SECRET_NAME,
  },
});

const CONTENTS: BundleDatasetContents = {
  train: ['{"input":"q1"}', '{"input":"q2"}'],
  validation: ['{"input":"v1"}'],
  test: ['{"input":"t1"}'],
};

// ============================================================
// Registry
// ============================================================

describe("worker registry", () => {
  it("exposes Kaggle as the only M2 worker", () => {
    expect(TRAINING_WORKERS).toHaveLength(1);
    expect(TRAINING_WORKERS[0].id).toBe("kaggle");
  });

  it("getTrainingWorker returns the Kaggle worker and throws on unknown ids", () => {
    expect(getTrainingWorker("kaggle")).toBe(kaggleTrainingWorker);
    expect(() => getTrainingWorker("not-a-worker" as any)).toThrow(/Unknown training worker/);
  });

  it("declares T4 / fp16 / resume / secrets capabilities", () => {
    expect(KAGGLE_CAPABILITIES.dtype).toBe("fp16");
    expect(KAGGLE_CAPABILITIES.supportsResume).toBe(true);
    expect(KAGGLE_CAPABILITIES.supportsSecrets).toBe(true);
    expect(KAGGLE_CAPABILITIES.persistentPath).toBe("/kaggle/working");
    expect(KAGGLE_CAPABILITIES.gpuClass).toContain("T4");
  });
});

// ============================================================
// Notebook rendering
// ============================================================

describe("notebook-render.ts", () => {
  it("the template is a 16-cell notebook whose sentinel is in cell 0", () => {
    const template = loadNotebookTemplate();
    expect(template.cells).toHaveLength(16);
    const cell0 = JSON.stringify(template.cells[0].source);
    expect(cell0).toContain(PACKAGE_SENTINEL);
  });

  it("supports governed harmony-messages-v1 JSONL records", () => {
    const template = loadNotebookTemplate();

    const source = template.cells
      .map((cell) =>
        Array.isArray(cell.source)
          ? cell.source.join("")
          : String(cell.source),
      )
      .join("\n");

    expect(source).toContain("harmony-messages-v1");
    expect(source).toContain("record.get('messages')");
    expect(source).toContain("tokenizer.apply_chat_template");
  });

  it("renders deterministically (same package → byte-identical content + sha256)", () => {
    const pkg = makeValidPackage();
    const a = renderNotebook(pkg);
    const b = renderNotebook(pkg);
    expect(a.content).toBe(b.content);
    expect(a.sha256).toBe(b.sha256);
    expect(a.filename).toBe(`${pkg.experimentId}.ipynb`);
  });

  it("embeds the canonical manifest and removes the sentinel", () => {
    const pkg = makeValidPackage();
    const { content } = renderNotebook(pkg);
    expect(content).not.toContain(PACKAGE_SENTINEL);
    const nb = JSON.parse(content);
    expect(nb.nbformat).toBe(4);
    expect(nb.cells).toHaveLength(16);
    expect(nb.cells[0].source.join("")).toContain(pkg.packageId);
    expect(content).toContain(pkg.dataset.datasetHash);
  });

  it("normalises every cell (execution_count null, outputs empty)", () => {
    const nb = JSON.parse(renderNotebook(makeValidPackage()).content);
    for (const cell of nb.cells) {
      expect(cell.execution_count).toBeNull();
      expect(cell.outputs).toEqual([]);
      expect(Array.isArray(cell.source)).toBe(true);
    }
  });

  it("never embeds a real HF token — only the secret NAME", () => {
    const { content } = renderNotebook(HF_DESTINATION_PKG);
    // No literal HF token material anywhere in the notebook.
    expect(content).not.toMatch(/hf_[A-Za-z0-9]{20,}/);
    // The secret is referenced by name only.
    expect(content).toContain(HF_TOKEN_SECRET_NAME);
    expect(content).toContain("get_secret");
    // The repo id is safe to embed; the token is not.
    expect(content).toContain("gharibo/experiment-001-adapter");
  });

  it("a plain package embeds no credential material either", () => {
    const { content } = renderNotebook(makeValidPackage());
    expect(content).not.toMatch(/hf_[A-Za-z0-9]{20,}/);
    expect(content).toContain(HF_TOKEN_SECRET_NAME); // documented fallback name
  });
});

// ============================================================
// Bundle assembly
// ============================================================

describe("bundle.ts", () => {
  it("lays out manifest + inputs + notebook + checksums", () => {
    const pkg = makeValidPackage();
    const files = buildBundle(pkg, CONTENTS);
    const root = bundleRoot(pkg);
    expect(files.map((f) => f.relativePath)).toEqual([
      `${root}/manifest.json`,
      `${root}/README.md`,
      `${root}/dataset/dataset.json`,
      `${root}/dataset/train.jsonl`,
      `${root}/dataset/validation.jsonl`,
      `${root}/dataset/test.jsonl`,
      `${root}/notebook/${pkg.experimentId}.ipynb`,
      `${root}/CHECKSUMS.sha256`,
    ]);
  });

  it("is deterministic (same package + contents → identical file hashes)", () => {
    const pkg = makeValidPackage();
    const a = buildBundle(pkg, CONTENTS);
    const b = buildBundle(pkg, CONTENTS);
    expect(a.map((f) => f.sha256)).toEqual(b.map((f) => f.sha256));
    expect(a.map((f) => f.content)).toEqual(b.map((f) => f.content));
  });

  it("writes one JSONL line per record and a final newline", () => {
    const files = buildBundle(makeValidPackage(), CONTENTS);
    const train = files.find((f) => f.relativePath.endsWith("dataset/train.jsonl"))!;
    expect(train.content).toBe('{"input":"q1"}\n{"input":"q2"}\n');
  });

  it("CHECKSUMS.sha256 lists every file (sorted) plus the rollup", () => {
    const pkg = makeValidPackage();
    const files = buildBundle(pkg, CONTENTS);
    const checksums = files.find((f) => f.relativePath.endsWith("CHECKSUMS.sha256"))!;
    const others = files.filter((f) => !f.relativePath.endsWith("CHECKSUMS.sha256"));
    for (const f of others) {
      expect(checksums.content).toContain(`${f.sha256}  ${f.relativePath}`);
    }
    const expectedRollup = artifactRollup(
      others.map((f) => ({ relativePath: f.relativePath, sha256: f.sha256 })),
    );
    expect(checksums.content).toContain(`# rollup  ${expectedRollup}`);
    expect(buildChecksumsFile(others)).toBe(checksums.content);
  });

  it("no bundle file contains a real HF token", () => {
    for (const f of buildBundle(HF_DESTINATION_PKG, CONTENTS)) {
      expect(f.content).not.toMatch(/hf_[A-Za-z0-9]{20,}/);
    }
  });
});

// ============================================================
// Instructions
// ============================================================

describe("instructions.ts", () => {
  it("states the zero-cost policy and needs no secret for a local package", () => {
    const pkg = makeValidPackage();
    const instr = instructions(pkg);
    const joined = instr.steps.join(" ");
    expect(joined).toContain("ZERO-COST");
    expect(joined).toContain("No Kaggle Secret is needed");
    expect(instr.title).toContain(pkg.experimentId);
  });

  it("references the secret NAME (never a value) for an hf destination", () => {
    const instr = instructions(HF_DESTINATION_PKG);
    const joined = instr.steps.join(" ");
    expect(joined).toContain(HF_TOKEN_SECRET_NAME);
    expect(joined).not.toMatch(/hf_[A-Za-z0-9]{20,}/);
  });

  it("renders a README that claims no metrics", () => {
    const pkg = makeValidPackage();
    const readme = renderReadme(pkg, instructions(pkg));
    expect(readme).toContain("NOT_RUN");
    expect(readme).toContain(pkg.dataset.datasetHash);
    expect(readme).not.toMatch(/hf_[A-Za-z0-9]{20,}/);
  });
});

// ============================================================
// Resume planning + status normalisation
// ============================================================

describe("planResume", () => {
  const run: TrainingRun = {
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
    targetModules: ["q_proj"],
    quantization: "4-bit",
    seed: 3407,
    device: null,
    status: "INTERRUPTED",
    startTime: null,
    endTime: null,
    checkpointPath: null,
    logs: null,
    metrics: {},
    preflightResult: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };

  it("classifies a checkpoint-supplied run as resumable (patch sets the resume point)", () => {
    const plan = planResume({
      runId: "run-1",
      checkpointRef: "outputs/checkpoint-50",
      resumeFromCheckpoint: "outputs/checkpoint-50",
    });
    expect(plan.packagePatch.resumeFromCheckpoint).toBe("outputs/checkpoint-50");
    expect(plan.instructions.join(" ")).toContain("outputs/checkpoint-50");
    // Applying the patch to the run yields a package that resumes.
    const policy = deriveCheckpointPolicy({ ...run, resumeFromCheckpoint: plan.packagePatch.resumeFromCheckpoint });
    expect(policy.resumeFromCheckpoint).toBe("outputs/checkpoint-50");
    expect(policy.saveStrategy).toBe("steps");
  });

  it("classifies a fresh run as new (no resume point)", () => {
    const policy = deriveCheckpointPolicy({ ...run, status: "DRAFT", resumeFromCheckpoint: null });
    expect(policy.resumeFromCheckpoint).toBeNull();
  });
});

describe("normalizeStatus", () => {
  it("maps a completion marker to COMPLETED", () => {
    expect(normalizeStatus({ hasCompletionMarker: true }).state).toBe("COMPLETED");
  });

  it("maps a traceback to FAILED", () => {
    expect(normalizeStatus({ hasTraceback: true }).state).toBe("FAILED");
  });

  it("maps an operator cancellation to CANCELLED", () => {
    expect(normalizeStatus({ cancelled: true }).state).toBe("CANCELLED");
  });

  it("maps an unexplained session end to INTERRUPTED and flags RESUMABLE when checkpoints exist", () => {
    const plain = normalizeStatus({});
    expect(plain.state).toBe("INTERRUPTED");

    const withCkpt = normalizeStatus({ hasCheckpoint: true, hasTrainerState: true });
    expect(withCkpt.state).toBe("INTERRUPTED");
    expect(withCkpt.detail).toContain("RESUMABLE");

    const withoutCkpt = normalizeStatus({ hasCheckpoint: true });
    expect(withoutCkpt.detail).toContain("No checkpoint");
  });

  it("applies precedence: cancelled > completed > traceback", () => {
    expect(normalizeStatus({ cancelled: true, hasCompletionMarker: true, hasTraceback: true }).state).toBe(
      "CANCELLED",
    );
    expect(normalizeStatus({ hasCompletionMarker: true, hasTraceback: true }).state).toBe("COMPLETED");
  });

  it("always returns a valid WorkerStatus shape", () => {
    for (const raw of [undefined, null, {}, { hasTraceback: true }]) {
      const s = normalizeStatus(raw);
      expect(typeof s.detail).toBe("string");
      expect(typeof s.updatedAt).toBe("string");
      expect(["PENDING", "RUNNING", "COMPLETED", "FAILED", "INTERRUPTED", "RESUMABLE", "CANCELLED"]).toContain(
        s.state,
      );
    }
  });
});

// ============================================================
// Cross-check: the fixture package is itself exportable
// ============================================================

describe("worker integration sanity", () => {
  it("renders a notebook for a package that passes validation", () => {
    const pkg = HF_DESTINATION_PKG;
    expect(hasBlockingErrors(validatePackage(pkg))).toBe(false);
    expect(() => renderNotebook(pkg)).not.toThrow();
  });
});
