/** In-memory Gold preview. No DB, worker, model, network or persistence imports. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import type { BundleFile, DatasetRef, PackagePreviewProvenance } from "@gharibo/shared";
import { TRAINING_PACKAGE_SCHEMA_VERSION } from "@gharibo/shared";
import { loadGovernedGoldSource, type GovernedGoldSource } from "./governed-gold";
import { goldCandidateRecipe, goldCandidateRecipeHash } from "./gold-recipe";
import { canonicalJson, sha256Bytes, sha256Canonical, sha256Hex } from "./hash";
import { finalizePackage, pinnedEngineConfig, serializeManifest, UNSLOTH_ENGINE_VERSION } from "./package";
import { formatIssues, hasBlockingErrors, validatePackage } from "./validate";
import { createZip } from "./zip";

export const ACCEPTED_GOLD_HASHES = {
  dataset: "84acad9b1ba0d693ece0c2b53112a9948b171d2ccf1f6d81e5c485c42c1d65a5",
  train: "84025de18403b8660d9702877b2b6fd329cedb886cad0095ab67e4daa3828ad2",
  validation: "063fb4422aed247b3f92c0f0d5b1291af46fd4357ca48829a7e7f6ce98815787",
  test: "55466db2de013b7ff629eb87fd9f66bd30f86afc2df4f3ffc139e45c8350e45b",
};
export const ACCEPTED_QUALIFICATION_HASH =
  "6d15bcf5ff7b120f34c7cb968eab196be285ad92b4ad2e76c44412360113dcc0";

/** Full physical policy, without manufacturing a Data Factory minimum. */
export function goldDatasetRef(source: GovernedGoldSource): DatasetRef {
  const { declaredMinimumRecordsPerSplit, ...policy } = source.splitPolicy;
  return {
    datasetId: source.datasetId,
    recordFormat: source.recordFormat,
    datasetVersion: source.datasetVersion,
    datasetVersionId: source.datasetHash,
    datasetHash: source.datasetHash,
    splitHashes: { ...source.splitHashes },
    splitPolicy: { ...structuredClone(policy), minimumRecordsPerSplit: declaredMinimumRecordsPerSplit },
    recordCount: source.recordCount,
  };
}

/** Provenance of relevant code bytes, independent of index staging and line endings. */
export function previewGitContext(repoRoot: string) {
  const git = (...args: string[]) => execFileSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const sourcePaths = [
    "apps/web/lib/training/gold-preview.ts", "apps/web/lib/training/gold-recipe.ts",
    "apps/web/lib/training/governed-gold.ts", "apps/web/lib/training/package.ts",
    "apps/web/lib/training/validate.ts", "apps/web/lib/training/hash.ts",
    "apps/web/lib/training/zip.ts", "packages/shared/src/types/training-package.ts",
    "scripts/training/preview-gold.ts",
  ];
  return {
    gitCommitSha: git("rev-parse", "HEAD"),
    workingTreeDirty: git("status", "--porcelain", "--untracked-files=normal").length > 0,
    sourceFilesHash: sha256Canonical(Object.fromEntries(sourcePaths.map((file) => [
      file, sha256Hex(fs.readFileSync(path.join(repoRoot, file), "utf8").replace(/\r\n/g, "\n")),
    ]))),
  };
}

export function buildGoldPackagePreview(options: {
  repoRoot: string;
  dataDir?: string;
}) {
  const { repoRoot } = options;
  const state = JSON.parse(fs.readFileSync(path.join(repoRoot, "governance/GHARIBO_MASTER_STATE.json"), "utf8"));
  const experiment = state.experiments["GHARIBO-exp-001"];
  if (state.training.hasStarted !== false || state.training.status !== "NOT_STARTED" ||
      state.currentState.trainingHasStarted !== false || state.currentState.trainingStatus !== "NOT_STARTED" ||
      experiment.trainingAuthorized !== false || experiment.trainingRunId !== null || experiment.packageId !== null ||
      state.training.qualification.ctoAccepted !== true ||
      state.training.qualification.qualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      state.training.engine.freezeApplied !== true ||
      state.training.engine.freezeSourceQualificationHash !== ACCEPTED_QUALIFICATION_HASH ||
      state.training.engine.freezeLabel !== UNSLOTH_ENGINE_VERSION) {
    throw new Error("Gold preview requires the accepted qualification/freeze and NOT_AUTHORIZED / NOT_STARTED state");
  }
  const source = loadGovernedGoldSource(options.dataDir ?? path.join(repoRoot,
    "data/processed/gharibo-research-gold-v0.1"));
  if (source.datasetHash !== ACCEPTED_GOLD_HASHES.dataset ||
      (["train", "validation", "test"] as const).some((s) => source.splitHashes[s] !== ACCEPTED_GOLD_HASHES[s])) {
    throw new Error("Physical Gold differs from the accepted content hashes");
  }
  const recipe = goldCandidateRecipe();
  const recipeHash = goldCandidateRecipeHash();
  if (state.training.packagePreview?.recipeHash !== recipeHash) {
    throw new Error("Gold recipe identity differs from canonical governance");
  }
  const git = previewGitContext(repoRoot);
  const preview: PackagePreviewProvenance = {
    status: "PREVIEW", qualificationHash: ACCEPTED_QUALIFICATION_HASH, recipeHash,
    sourceFilesHash: git.sourceFilesHash, workingTreeDirty: git.workingTreeDirty,
    trainingAuthorized: false, trainingHasStarted: false, testUsage: "HASH_INTEGRITY_ONLY",
  };
  const pkg = finalizePackage({
    schemaVersion: TRAINING_PACKAGE_SCHEMA_VERSION,
    experimentId: "GHARIBO-exp-001", gitCommitSha: git.gitCommitSha, preview,
    ...recipe.configuration,
    dataset: goldDatasetRef(source),
    engine: pinnedEngineConfig(),
    environmentMetadata: { os: "", pythonVersion: "", packages: {}, gpu: null, cuda: null },
    createdAt: recipe.definedAt,
  });
  const issues = validatePackage(pkg, { splitCounts: source.counts });
  if (hasBlockingErrors(issues)) throw new Error(formatIssues(issues));
  const manifest = serializeManifest(pkg);
  const file = (relativePath: string, content: string): BundleFile => ({ relativePath, content, sha256: sha256Hex(content) });
  // This review bundle deliberately has no executable notebook or TEST payload.
  const files = [
    file("manifest.json", manifest),
    file("recipe.json", canonicalJson(recipe)),
    file("dataset/train.jsonl", source.contents.train.join("\n") + "\n"),
    file("dataset/validation.jsonl", source.contents.validation.join("\n") + "\n"),
    file("PREVIEW.txt", "PREVIEW ONLY\nGHARIBO-exp-001 NOT AUTHORIZED\nTRAINING HAS NOT STARTED\nTEST: hash integrity only; no payload included.\n"),
  ].sort((a, b) => a.relativePath < b.relativePath ? -1 : 1);
  const checksums = files.map((f) => `${f.sha256}  ${f.relativePath}`).join("\n") + "\n";
  files.push(file("CHECKSUMS.sha256", checksums));
  const zip = createZip(files.map((f) => ({ path: f.relativePath, content: f.content })));
  return { pkg, manifest, files, checksums, zip, recipeHash, bundleSha256: sha256Bytes(zip) };
}

/** Two independent physical reads/builds; compares actual bytes, not only digests. */
export function verifyGoldPackagePreview(options: Parameters<typeof buildGoldPackagePreview>[0]) {
  const first = buildGoldPackagePreview(options);
  const second = buildGoldPackagePreview(options);
  if (first.pkg.packageId !== second.pkg.packageId ||
      !Buffer.from(first.manifest).equals(Buffer.from(second.manifest)) ||
      !Buffer.from(first.checksums).equals(Buffer.from(second.checksums)) ||
      first.files.length !== second.files.length ||
      first.files.some((f, i) => f.relativePath !== second.files[i].relativePath ||
        !Buffer.from(f.content).equals(Buffer.from(second.files[i].content))) ||
      !Buffer.from(first.zip).equals(Buffer.from(second.zip))) {
    throw new Error("Gold preview is not byte-for-byte deterministic");
  }
  return {
    status: "PREVIEW", package_id: first.pkg.packageId, recipe_hash: first.recipeHash,
    git_commit_sha: first.pkg.gitCommitSha, preview: first.pkg.preview,
    engine_freeze: first.pkg.engine.engineVersion,
    dataset_hash: first.pkg.dataset.datasetHash, split_hashes: first.pkg.dataset.splitHashes,
    manifest_sha256: sha256Hex(first.manifest), bundle_sha256: first.bundleSha256,
    checksums_sha256: sha256Hex(first.checksums),
    files: first.files.map(({ relativePath, sha256 }) => ({ path: relativePath, sha256 })),
    byte_for_byte_identical: true, independent_builds: 2,
    persisted: false, training_authorized: false, training_has_started: false,
  };
}
