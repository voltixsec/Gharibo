/**
 * Prepares — or verifies — the governed Kaggle launch bundle for GHARIBO-exp-001.
 *
 * Run from the repository root:
 *   npm run kaggle:prepare          # write / refresh the bundle
 *   npm run kaggle:prepare -- --check   # drift check, writes nothing
 *
 * The launch bundle is the exact on-disk artifact set that is uploaded to Kaggle:
 *
 *   dataset/dataset-metadata.json
 *   dataset/train.jsonl
 *   dataset/validation.jsonl
 *   kernel/<experiment>.ipynb
 *   kernel/kernel-metadata.json
 *   start-plan.json
 *
 * `launchBundleHash` is a committed, reproducible digest over the bundle PAYLOAD —
 * every file except `start-plan.json`, which carries the hash itself:
 *
 *   sha256( "\n".join( sorted( `${sha256(file)}  ${relativePath}` ) ) + "\n" )
 *
 * The TEST payload is never written: the governed package holds TEST out, so the
 * bundle carries TRAIN + VALIDATION only and the TEST hash stays metadata.
 *
 * INCIDENT NOTE (GHARIBO-exp-001, first governed launch). The DEC-0027
 * `launchBundleHash` was produced by an uncommitted ad-hoc step and is NOT
 * reproducible from this repository. DEC-0028 supersedes it with this committed
 * algorithm. The DEC-0027 value is left untouched as historical evidence for the
 * artifact it actually anchored.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeDb, db } from "../../apps/web/lib/db/index";
import { trainingPackagesRepository } from "../../apps/web/lib/db/repositories/training-packages";
import { parseManifest, serializeManifest } from "../../apps/web/lib/training/package";
import { loadGovernedGoldSource } from "../../apps/web/lib/training/governed-gold";
import { renderNotebook } from "../../apps/web/lib/workers/kaggle/notebook-render";
import { bundlePayloadSplits } from "../../apps/web/lib/workers/kaggle/test-policy";

const EXPERIMENT = "GHARIBO-exp-001";
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const check = process.argv.includes("--check");

if (path.resolve(process.env.DATABASE_PATH ?? "") !== path.join(root, "apps/web/data/gharibo.db")) {
  throw new Error("Set DATABASE_PATH to the absolute apps/web/data/gharibo.db application path");
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Kaggle start bundle: ${message}`);
}

/** sha256 over the sorted `sha256  relativePath` manifest of the bundle payload. */
export function launchBundleHash(pairs: Array<{ relativePath: string; sha256: string }>): string {
  const lines = pairs
    .map((p) => `${p.sha256}  ${p.relativePath}`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sha256(lines.join("\n") + "\n");
}

try {
  const state = JSON.parse(
    fs.readFileSync(path.join(root, "governance/GHARIBO_MASTER_STATE.json"), "utf8"),
  );
  const start =
    state.training.kaggleLaunchAuthorization ?? state.training.kaggleStartAuthorization;
  requireThat(start, "no Kaggle start authorization in the master state");

  const packages = trainingPackagesRepository.listByExperiment(EXPERIMENT);
  requireThat(packages.length === 1, "expected exactly one issued package");
  const manifest = packages[0].manifest;
  const pkg = parseManifest(manifest);
  requireThat(serializeManifest(pkg) === manifest, "persisted manifest is not canonical");
  requireThat(pkg.packageId === start.packageId, "package identity does not match the authorization");

  // TEST payload must never travel. This is the same policy the notebook enforces at runtime.
  const payloadSplits = bundlePayloadSplits(pkg);
  requireThat(!payloadSplits.includes("test"), "the governed package must hold TEST out");

  const source = loadGovernedGoldSource();
  requireThat(source.splitHashes.train === pkg.dataset.splitHashes.train, "train split hash drift");
  requireThat(
    source.splitHashes.validation === pkg.dataset.splitHashes.validation,
    "validation split hash drift",
  );

  const notebook = renderNotebook(pkg);

  const bundleRoot = path.join(root, "apps/web/data/kaggle-start", `${EXPERIMENT}-${start.runId}`);
  const datasetDir = path.join(bundleRoot, "dataset");
  const kernelDir = path.join(bundleRoot, "kernel");

  const existingKernelMetadata = path.join(kernelDir, "kernel-metadata.json");  const kernelId = fs.existsSync(existingKernelMetadata)
    ? (JSON.parse(fs.readFileSync(existingKernelMetadata, "utf8")) as { id: string }).id
    : `vokaigharibo/gharibo-exp-001-kaggle-start-${sha256(pkg.packageId).slice(0, 8)}`;

  const datasetMetadata = {
    title: "gharibo exp 001 gold tv",
    id: "vokaigharibo/gharibo-exp-001-gold-tv-fec22ca2",
    licenses: [{ name: "other" }],
    description:
      "PRIVATE proprietary GHARIBO training input. TRAIN and VALIDATION only. TEST payload is " +
      "intentionally excluded and remains HASH_INTEGRITY_ONLY. Not licensed for public redistribution.",
  };

  const kernelMetadata = {
    id: kernelId,
    title: kernelId.split("/")[1].replace(/-/g, " "),
    code_file: notebook.filename,
    language: "python",
    kernel_type: "notebook",
    is_private: true,
    enable_gpu: true,
    enable_internet: true,
    machine_shape: "NvidiaTeslaT4",
    dataset_sources: [datasetMetadata.id],
    competition_sources: [],
    kernel_sources: [],
    model_sources: [],
  };

  const payloadFiles: Array<{ relativePath: string; content: string }> = [
    { relativePath: "dataset/dataset-metadata.json", content: JSON.stringify(datasetMetadata, null, 2) + "\n" },
    { relativePath: "dataset/train.jsonl", content: source.contents.train.join("\n") + "\n" },
    { relativePath: "dataset/validation.jsonl", content: source.contents.validation.join("\n") + "\n" },
    { relativePath: `kernel/${notebook.filename}`, content: notebook.content },
    { relativePath: "kernel/kernel-metadata.json", content: JSON.stringify(kernelMetadata, null, 2) + "\n" },
  ];

  const pairs = payloadFiles.map((f) => ({ relativePath: f.relativePath, sha256: sha256(f.content) }));
  const bundleHash = launchBundleHash(pairs);

  const startPlan = {
    status: "PREPARED_NOT_LAUNCHED",
    decisionIntent: start.decisionId === "DEC-0028" ? "DEC-0028_KAGGLE_LAUNCH_REPAIRED" : "DEC-0027_KAGGLE_START",
    packageId: start.packageId,
    runId: start.runId,
    executionAuthorizationHash: start.executionAuthorizationHash,
    sourceCommit: pkg.gitCommitSha,
    notebookSha256: notebook.sha256,
    launchBundleHash: bundleHash,
    launchBundleHashAlgorithm:
      'sha256 over "\\n".join(sorted(`${sha256(file)}  ${relativePath}`)) + "\\n", payload files only',
    trainSplitHash: pkg.dataset.splitHashes.train,
    validationSplitHash: pkg.dataset.splitHashes.validation,
    testSplitHash: pkg.dataset.splitHashes.test,
    testUsage: "HASH_INTEGRITY_ONLY",
    testPayloadIncluded: false,
    testPayloadAccessed: false,
    trainerTrainCallCount: 1,
    worker: "kaggle",
    accelerator: "NvidiaTeslaT4",
    launchAttempted: false,
    trainingStarted: false,
  };

  const recorded = start.notebookSha256;
  const bundleMatches = start.launchBundleHash === bundleHash;

  if (check) {
    const problems: string[] = [];
    if (!bundleMatches) {
      problems.push(`recorded launchBundleHash ${start.launchBundleHash} != computed ${bundleHash}`);
    }
    if (recorded !== notebook.sha256) {
      problems.push(`recorded notebookSha256 ${recorded} != rendered ${notebook.sha256}`);
    }
    for (const f of payloadFiles) {
      const onDisk = path.join(bundleRoot, f.relativePath);
      if (!fs.existsSync(onDisk)) {
        problems.push(`missing on disk: ${f.relativePath}`);
        continue;
      }
      if (fs.readFileSync(onDisk, "utf8") !== f.content) {
        problems.push(`drift on disk: ${f.relativePath}`);
      }
    }
    if (fs.existsSync(path.join(datasetDir, "test.jsonl"))) {
      problems.push("TEST POLICY VIOLATION: dataset/test.jsonl exists in the launch bundle");
    }
    if (problems.length > 0) {
      for (const p of problems) console.error("  - " + p);
      throw new Error(`Kaggle start bundle drift (${problems.length} problem(s))`);
    }
    console.log(
      JSON.stringify(
        {
          status: "IN_SYNC",
          notebookSha256: notebook.sha256,
          launchBundleHash: bundleHash,
          payloadFiles: pairs.length,
          testPayloadIncluded: false,
          splits: payloadSplits,
        },
        null,
        2,
      ),
    );
  } else {
    for (const f of payloadFiles) {
      const target = path.join(bundleRoot, f.relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, f.content);
    }
    fs.writeFileSync(path.join(bundleRoot, "start-plan.json"), JSON.stringify(startPlan, null, 2) + "\n");
    // The governed bundle must never carry a TEST payload.
    const strayTest = path.join(datasetDir, "test.jsonl");
    if (fs.existsSync(strayTest)) {
      fs.rmSync(strayTest);
      console.log("removed stray dataset/test.jsonl (TEST is held out)");
    }
    console.log(
      JSON.stringify(
        {
          status: "PREPARED_NOT_LAUNCHED",
          bundleRoot: path.relative(root, bundleRoot).split(path.sep).join("/"),
          kernelId,
          notebookSha256: notebook.sha256,
          launchBundleHash: bundleHash,
          payloadFiles: pairs.length,
          splits: payloadSplits,
          testPayloadIncluded: false,
        },
        null,
        2,
      ),
    );
  }

  const integrity = db().pragma("integrity_check", { simple: true });
  if (integrity !== "ok") throw new Error("Database integrity failed");
} finally {
  closeDb();
}
