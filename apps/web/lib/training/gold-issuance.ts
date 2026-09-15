/** DEC-0025 issuance only. No worker, notebook, network, model or trainer imports. */
import fs from "node:fs";
import path from "node:path";
import type { BundleFile, TrainingRun } from "@gharibo/shared";
import { db } from "@/lib/db/index";
import { trainingRunsRepository } from "@/lib/db/repositories/training-runs";
import { trainingPackagesRepository } from "@/lib/db/repositories/training-packages";
import { trainingRunEventsRepository } from "@/lib/db/repositories/training-run-events";
import { experimentsRepository } from "@/lib/db/repositories/experiments";
import { isAcceptedGoldPreviewState, isIssuedGoldState } from "./gold-authorization.mjs";
import { goldCandidateRecipe, goldCandidateRecipeHash } from "./gold-recipe";
import { loadGovernedGoldSource } from "./governed-gold";
import { goldDatasetRef } from "./gold-preview";
import { computePackageIdFromManifest, finalizePackage, parseManifest, serializeManifest } from "./package";
import { canonicalJson, sha256Bytes, sha256Canonical, sha256Hex } from "./hash";
import { formatIssues, hasBlockingErrors, validatePackage } from "./validate";
import { createZip } from "./zip";

const EXPERIMENT = "GHARIBO-exp-001";
function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(`Gold issuance: ${message}`);
}

export function prepareGoldIssuance(state: any, previewManifest: string, issuedAt: string, dataDir: string) {
  requireThat((isAcceptedGoldPreviewState(state) || isIssuedGoldState(state)) &&
    state.experiments[EXPERIMENT].trainingAuthorized === true, "valid DEC-0025 required");
  const authorization = state.training.authorization;
  const candidate = parseManifest(previewManifest);
  requireThat(candidate.packageId === authorization.authorizedPreviewPackageId &&
    computePackageIdFromManifest(previewManifest) === candidate.packageId &&
    serializeManifest(candidate) === previewManifest &&
    candidate.gitCommitSha === authorization.authorizedCodeSnapshot &&
    candidate.preview?.workingTreeDirty === false, "authorized clean snapshot preview mismatch");
  const recipe = goldCandidateRecipe();
  requireThat(goldCandidateRecipeHash() === authorization.recipeHash &&
    candidate.preview?.recipeHash === authorization.recipeHash &&
    candidate.preview?.qualificationHash === authorization.qualificationHash,
  "recipe/qualification mismatch");
  for (const [key, value] of Object.entries(recipe.configuration)) {
    requireThat(canonicalJson(candidate[key as keyof typeof candidate]) === canonicalJson(value), `recipe field ${key} changed`);
  }
  const source = loadGovernedGoldSource(dataDir);
  requireThat(canonicalJson(goldDatasetRef(source)) === canonicalJson(candidate.dataset), "physical dataset or split policy changed");
  requireThat(new Date(issuedAt).toISOString() === issuedAt, "invalid issuance timestamp");
  const { preview, ...draft } = candidate;
  const pkg = finalizePackage({ ...draft, createdAt: issuedAt });
  const issues = validatePackage(pkg, { splitCounts: source.counts });
  requireThat(!hasBlockingErrors(issues), formatIssues(issues));
  const manifest = serializeManifest(pkg);
  const binding = {
    decisionId: "DEC-0025", authorizedCodeSnapshot: candidate.gitCommitSha,
    authorizedPreviewPackageId: candidate.packageId, recipeHash: authorization.recipeHash,
    qualificationHash: authorization.qualificationHash, engineFreeze: authorization.engineFreeze,
    datasetHash: source.datasetHash, splitHashes: source.splitHashes, recordFormat: source.recordFormat,
    sourceFilesHash: preview!.sourceFilesHash, testUsage: "HASH_INTEGRITY_ONLY",
    executionAuthorized: false, executionStarted: false,
  };
  const file = (relativePath: string, content: string): BundleFile => ({ relativePath, content, sha256: sha256Hex(content) });
  const files = [
    file("manifest.json", manifest), file("recipe.json", canonicalJson(recipe)),
    file("authorization.json", canonicalJson(binding)),
    file("dataset/train.jsonl", source.contents.train.join("\n") + "\n"),
    file("dataset/validation.jsonl", source.contents.validation.join("\n") + "\n"),
    file("README.txt", "IMMUTABLE ISSUED TRAINING PACKAGE — DEC-0025\nDRAFT run only. Execution requires a separate explicit checkpoint.\nTRAINING HAS NOT STARTED\nTEST: HASH_INTEGRITY_ONLY; no TEST payload is bundled.\nNo executable notebook is issued by this command.\n"),
  ].sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));
  const checksums = files.map((f) => `${f.sha256}  ${f.relativePath}`).join("\n") + "\n";
  files.push(file("CHECKSUMS.sha256", checksums));
  const zip = createZip(files.map((f) => ({ path: f.relativePath, content: f.content })));
  return { pkg, manifest, binding, files, zip, issuedAt, bundleSha256: sha256Bytes(zip) };
}

type Prepared = ReturnType<typeof prepareGoldIssuance>;
type RunInput = Parameters<typeof trainingRunsRepository.create>[0];
function runInput(prepared: Prepared): RunInput {
  const p = prepared.pkg;
  return {
    baseModel: p.baseModel, method: "qlora", datasetId: null, datasetVersion: p.dataset.datasetHash,
    trainExamples: 640, validationExamples: 80, epochs: p.epochs, learningRate: p.learningRate,
    batchSize: p.batch.perDeviceTrainBatchSize, gradientAccumulation: p.batch.gradientAccumulationSteps,
    loraRank: p.lora.r, loraAlpha: p.lora.alpha, targetModules: p.lora.targetModules,
    quantization: p.quantization, seed: p.seed, device: null, status: "DRAFT", startTime: null,
    endTime: null, checkpointPath: null, logs: null, metrics: {}, preflightResult: null,
    maxSeqLength: p.sequenceLength, optimizer: p.optimizer, warmupSteps: p.warmupSteps,
    lrSchedulerType: p.lrSchedulerType, weightDecay: p.weightDecay, dtype: p.dtype,
    saveStrategy: p.checkpointPolicy.saveStrategy, saveSteps: p.checkpointPolicy.saveSteps,
    saveTotalLimit: p.checkpointPolicy.saveTotalLimit, baseModelRevision: p.baseModelRevision,
    loaderModelId: p.loaderModelId, workerId: "kaggle", packageId: p.packageId,
    resumeFromCheckpoint: p.checkpointPolicy.resumeFromCheckpoint,
  };
}

/** Reopen-safe verification against persisted rows, package bytes, receipt and audit event. */
export function verifyGoldIssuance(prepared: Prepared) {
  const experiment = experimentsRepository.get(EXPERIMENT);
  requireThat(experiment, "missing persisted experiment");
  const receipt = experiment.provenance as any;
  const { receiptHash, ...body } = receipt;
  requireThat(sha256Canonical(body) === receiptHash, "receipt hash mismatch");
  requireThat(receipt.packageId === prepared.pkg.packageId && receipt.issuedAt === prepared.issuedAt &&
    canonicalJson(receipt.binding) === canonicalJson(prepared.binding) &&
    receipt.manifestSha256 === sha256Hex(prepared.manifest) &&
    receipt.bundleSha256 === prepared.bundleSha256, "persisted issuance identity mismatch");
  const packages = trainingPackagesRepository.listByExperiment(EXPERIMENT);
  requireThat(packages.length === 1, "expected exactly one package for experiment");
  const row = packages[0];
  requireThat(row.id === receipt.packageId && row.manifestHash === row.id &&
    computePackageIdFromManifest(row.manifest) === row.id && row.manifest === prepared.manifest &&
    row.runId === receipt.runId && row.notebookSha256 === null && row.bundlePath &&
    row.datasetId === null && row.datasetVersionId === prepared.pkg.dataset.datasetHash,
  "persisted package linkage mismatch");
  requireThat(fs.existsSync(row.bundlePath) && Buffer.from(fs.readFileSync(row.bundlePath)).equals(Buffer.from(prepared.zip)), "persisted bundle bytes mismatch");
  const run = trainingRunsRepository.get(receipt.runId);
  requireThat(run, "missing DRAFT run");
  for (const [key, value] of Object.entries(runInput(prepared))) {
    requireThat(canonicalJson(run[key as keyof TrainingRun]) === canonicalJson(value), `persisted run field ${key} mismatch`);
  }
  requireThat(experiment.trainingRunId === run.runId && experiment.packageId === row.id &&
    experiment.codeVersion === prepared.pkg.gitCommitSha &&
    canonicalJson(experiment.manifest) === prepared.manifest &&
    canonicalJson(experiment.results) === "{}", "persisted experiment mismatch");
  const events = trainingRunEventsRepository.listByRun(run.runId);
  requireThat(events.length === 1 && events[0].fromStatus === null && events[0].toStatus === "DRAFT" &&
    events[0].source === "DEC-0025", "issuance audit event mismatch");
  const linked = db().prepare("SELECT count(*) AS n FROM training_runs WHERE package_id = ?").get(row.id) as { n: number };
  requireThat(linked.n === 1, "expected exactly one linked DRAFT run");
  return receipt;
}

/** Atomic database issuance. Retries verify the existing identity without creating another run. */
export function issueGoldPackageAndRun(prepared: Prepared, bundleDirectory: string) {
  const database = db();
  return database.transaction(() => {
    if (experimentsRepository.get(EXPERIMENT)) return verifyGoldIssuance(prepared);
    requireThat(trainingPackagesRepository.listByExperiment(EXPERIMENT).length === 0, "unlinked existing package; stop");
    fs.mkdirSync(bundleDirectory, { recursive: true });
    const bundlePath = path.resolve(bundleDirectory, `${prepared.pkg.packageId}.zip`);
    if (fs.existsSync(bundlePath)) {
      requireThat(fs.readFileSync(bundlePath).equals(Buffer.from(prepared.zip)), "existing bundle differs; never overwrite");
    } else {
      fs.writeFileSync(bundlePath, prepared.zip, { flag: "wx" });
    }
    const run = trainingRunsRepository.create(runInput(prepared));
    const row = trainingPackagesRepository.create({ manifest: prepared.manifest, experimentId: EXPERIMENT,
      datasetId: null, datasetVersionId: prepared.pkg.dataset.datasetHash, runId: run.runId,
      notebookSha256: null, bundlePath, workerId: "kaggle" });
    const body = { status: "ISSUED_DRAFT", decisionId: "DEC-0025", packageId: row.id, runId: run.runId,
      runStatus: "DRAFT", issuedAt: prepared.issuedAt, binding: prepared.binding,
      manifestSha256: sha256Hex(prepared.manifest), bundleSha256: prepared.bundleSha256,
      checksumsSha256: prepared.files.find((f) => f.relativePath === "CHECKSUMS.sha256")!.sha256,
      packageCount: 1, runCount: 1, executionAuthorized: false, executionStarted: false };
    const receipt = { ...body, receiptHash: sha256Canonical(body) };
    database.prepare(`INSERT INTO experiments (id, code_version, dataset_version, configuration, seed,
      results, notes, training_run_id, created_at, updated_at, package_id, manifest, provenance)
      VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)`).run(EXPERIMENT,
      prepared.pkg.gitCommitSha, prepared.pkg.dataset.datasetHash, canonicalJson(goldCandidateRecipe().configuration),
      prepared.pkg.seed, "DEC-0025 issuance only; execution is not authorized", run.runId,
      prepared.issuedAt, prepared.issuedAt, row.id, prepared.manifest, canonicalJson(receipt));
    trainingRunEventsRepository.append({ runId: run.runId, fromStatus: null, toStatus: "DRAFT",
      source: "DEC-0025", reason: "Immutable package and DRAFT run issued; TRAINING HAS NOT STARTED" });
    // Scope persistence locks to this checkpoint, preserving all unrelated local rows.
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS dec0025_one_package ON training_packages(experiment_id)
        WHERE experiment_id = 'GHARIBO-exp-001';
      CREATE UNIQUE INDEX IF NOT EXISTS dec0025_one_run ON training_runs(package_id)
        WHERE package_id = '${row.id}';
      CREATE TRIGGER IF NOT EXISTS dec0025_package_no_update BEFORE UPDATE ON training_packages
        WHEN OLD.experiment_id = 'GHARIBO-exp-001' BEGIN SELECT RAISE(ABORT, 'DEC-0025 immutable package'); END;
      CREATE TRIGGER IF NOT EXISTS dec0025_package_no_delete BEFORE DELETE ON training_packages
        WHEN OLD.experiment_id = 'GHARIBO-exp-001' BEGIN SELECT RAISE(ABORT, 'DEC-0025 immutable package'); END;
      CREATE TRIGGER IF NOT EXISTS dec0025_run_no_update BEFORE UPDATE ON training_runs
        WHEN OLD.run_id = '${run.runId}' BEGIN SELECT RAISE(ABORT, 'DEC-0025 DRAFT: execution not authorized'); END;
      CREATE TRIGGER IF NOT EXISTS dec0025_run_no_delete BEFORE DELETE ON training_runs
        WHEN OLD.run_id = '${run.runId}' BEGIN SELECT RAISE(ABORT, 'DEC-0025 immutable issuance'); END;
      CREATE TRIGGER IF NOT EXISTS dec0025_experiment_no_update BEFORE UPDATE ON experiments
        WHEN OLD.id = 'GHARIBO-exp-001' BEGIN SELECT RAISE(ABORT, 'DEC-0025 immutable receipt'); END;
      CREATE TRIGGER IF NOT EXISTS dec0025_experiment_no_delete BEFORE DELETE ON experiments
        WHEN OLD.id = 'GHARIBO-exp-001' BEGIN SELECT RAISE(ABORT, 'DEC-0025 immutable receipt'); END;
    `);
    return verifyGoldIssuance(prepared);
  }).immediate();
}
