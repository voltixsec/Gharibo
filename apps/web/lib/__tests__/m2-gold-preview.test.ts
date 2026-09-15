import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as recipeModule from "@/lib/training/gold-recipe";
import { isAcceptedGoldPreviewState } from "@/lib/training/gold-authorization.mjs";
import * as gold from "@/lib/training/governed-gold";
import { goldCandidateRecipe, goldCandidateRecipeHash } from "@/lib/training/gold-recipe";
import { ACCEPTED_GOLD_HASHES, buildGoldPackagePreview, goldDatasetRef,
  verifyGoldPackagePreview } from "@/lib/training/gold-preview";
import { canonicalJson, sha256Bytes, sha256Hex } from "@/lib/training/hash";
import * as policy from "@/lib/training/package";
import { hasBlockingErrors, validatePackage } from "@/lib/training/validate";
import { renderNotebook } from "@/lib/workers/kaggle/notebook-render";
import { buildBundle } from "@/lib/workers/kaggle/bundle";
import { trainingPackagesRepository } from "@/lib/db/repositories/training-packages";

// Any accidental persistence, including reads that initialize SQLite, fails immediately.
vi.mock("@/lib/db/index", () => ({ db: () => { throw new Error("SQLite must not be opened"); } }));

const repoRoot = path.resolve(__dirname, "../../../..");
const options = { repoRoot };
const statePath = path.join(repoRoot, "governance/GHARIBO_MASTER_STATE.json");
const read = fs.readFileSync;
const authorizedState = JSON.parse(read(statePath, "utf8"));
function mockGovernanceState(state: any) {
  vi.spyOn(fs, "readFileSync").mockImplementation(((p: any, ...args: any[]) =>
    String(p).endsWith("GHARIBO_MASTER_STATE.json") ? JSON.stringify(state) : (read as any)(p, ...args)) as any);
}

/** Synthetic reader output: production physical verification is covered separately. */
function syntheticSource(): gold.GovernedGoldSource {
  return {
    datasetId: gold.GOVERNED_GOLD_DATASET_ID, datasetVersion: gold.GOVERNED_GOLD_DATASET_VERSION,
    recordFormat: gold.GOVERNED_GOLD_RECORD_FORMAT, recordCount: 800,
    counts: { train: 640, validation: 80, test: 80 },
    datasetHash: ACCEPTED_GOLD_HASHES.dataset,
    splitHashes: { train: ACCEPTED_GOLD_HASHES.train, validation: ACCEPTED_GOLD_HASHES.validation,
      test: ACCEPTED_GOLD_HASHES.test },
    splitPolicy: {
      algorithm: gold.GOVERNED_GOLD_SPLIT_ALGORITHM, seed: gold.GOVERNED_GOLD_SPLIT_SEED,
      ratios: { train: 0.8, validation: 0.1, test: 0.1 },
      declaredMinimumRecordsPerSplit: null, method: "synthetic fixture policy",
      lineHashAlgorithm: "sha256 raw lines", splitHashAlgorithm: "sha256 sorted line hashes",
      auditQuarantine: { auditSeed: 3407, auditCohortSize: 100,
        quarantinedInto: ["train", "validation"], testAudited: 0 },
      testHeldOut: true, testPolicy: "TEST is permanently held out.",
    },
    contents: { train: ['{"messages":[{"role":"user","content":"synthetic train"}]}'],
      validation: ['{"messages":[{"role":"user","content":"synthetic validation"}]}'] },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("B3 governed Gold package preview", () => {
  it("locks every policy default explicitly and hashes a fresh recipe copy", () => {
    const recipe = goldCandidateRecipe();
    const c = recipe.configuration;
    expect(c.optimizer).toBe(policy.DEFAULT_OPTIMIZER);
    expect(c.warmupSteps).toBe(policy.DEFAULT_WARMUP_STEPS);
    expect(c.lrSchedulerType).toBe(policy.DEFAULT_LR_SCHEDULER);
    expect(c.weightDecay).toBe(policy.DEFAULT_WEIGHT_DECAY);
    expect(c.checkpointPolicy).toEqual({ saveStrategy: "steps", saveSteps: policy.DEFAULT_SAVE_STEPS,
      saveTotalLimit: policy.DEFAULT_SAVE_TOTAL_LIMIT, resumeFromCheckpoint: null });
    expect(c.lora.dropout).toBe(policy.DEFAULT_LORA_DROPOUT);
    expect(c.lora.bias).toBe(policy.DEFAULT_LORA_BIAS);
    expect(c.dtype).toBe(policy.DEFAULT_DTYPE);
    expect(c.harmony).toEqual(policy.DEFAULT_HARMONY);
    expect(c.evaluationConfig).toEqual(policy.DEFAULT_EVALUATION_CONFIG);
    expect(c.baseModel).toBe(policy.BASE_MODEL_IDENTITY);
    expect(c.baseModelRevision).toBe(policy.BASE_MODEL_REVISION);
    expect(c.loaderModelId).toBe(policy.LOADER_MODEL_ID);
    expect(c).toMatchObject({ lora: { r: 16, alpha: 32, targetModules: ["q_proj", "v_proj"] },
      seed: 42, sequenceLength: 512, batch: { perDeviceTrainBatchSize: 1, gradientAccumulationSteps: 4 },
      learningRate: 2e-4, epochs: 1, maxSteps: null });
    expect(recipe.trainRecords).toBe(640);
    expect(sha256Hex(canonicalJson(recipe))).toBe(goldCandidateRecipeHash());
    c.lora.targetModules.push("changed");
    expect(goldCandidateRecipe().configuration.lora.targetModules).toEqual(["q_proj", "v_proj"]);
  });

  it("round-trips all Gold policy and preview fields without inventing a minimum", () => {
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(syntheticSource());
    const preview = buildGoldPackagePreview(options);
    const parsed = policy.parseManifest(preview.manifest);
    expect(authorizedState.experiments["GHARIBO-exp-001"].trainingAuthorized).toBe(true);
    expect(parsed.preview).toMatchObject({ trainingAuthorized: false, trainingHasStarted: false,
      testUsage: "HASH_INTEGRITY_ONLY" });
    expect(parsed).toEqual(preview.pkg);
    expect(policy.serializeManifest(parsed)).toBe(preview.manifest);
    expect(policy.computePackageIdFromManifest(preview.manifest)).toBe(preview.pkg.packageId);
    expect(hasBlockingErrors(validatePackage(parsed, { splitCounts: { train: 640, validation: 80, test: 80 } }))).toBe(false);
    expect(parsed.dataset.splitPolicy.minimumRecordsPerSplit).toBeNull();
    expect(JSON.parse(preview.manifest).dataset.split_policy.audit_quarantine.quarantined_into)
      .toEqual(["train", "validation"]);
  });

  it("compares two independent builds byte-for-byte and never reads TEST payload", () => {
    const source = syntheticSource();
    Object.defineProperty(source.contents, "test", { get() { throw new Error("TEST payload accessed"); } });
    const reader = vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(source);
    const result = verifyGoldPackagePreview(options);
    expect(reader).toHaveBeenCalledTimes(2);
    expect(result.byte_for_byte_identical).toBe(true);
    expect(result.persisted).toBe(false);
    expect(result.files.map((f) => f.path)).not.toContain("dataset/test.jsonl");
    expect(result.files.some((f) => f.path.endsWith(".ipynb"))).toBe(false);
  });

  it("checksums actual bundle bytes and includes only the permitted payload", () => {
    const source = syntheticSource();
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(source);
    const result = buildGoldPackagePreview(options);
    for (const f of result.files) {
      expect(sha256Hex(f.content)).toBe(f.sha256);
      if (f.relativePath !== "CHECKSUMS.sha256") expect(result.checksums).toContain(`${f.sha256}  ${f.relativePath}\n`);
    }
    expect(sha256Bytes(result.zip)).toBe(result.bundleSha256);
    expect(result.files.find((f) => f.relativePath === "dataset/train.jsonl")?.content)
      .toBe(source.contents.train.join("\n") + "\n");
  });

  it("fails if the second physical source differs", () => {
    const second = syntheticSource();
    second.contents.train.push("changed bytes");
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValueOnce(syntheticSource()).mockReturnValueOnce(second);
    expect(() => verifyGoldPackagePreview(options)).toThrow(/byte-for-byte/);
  });

  it("rejects an internally consistent but unaccepted dataset identity", () => {
    const source = syntheticSource();
    source.datasetHash = "0".repeat(64);
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(source);
    expect(() => buildGoldPackagePreview(options)).toThrow(/accepted content hashes/);
  });

  it("rejects partial, altered or executed DEC-0025 states before reading data", () => {
    const changed = (value: unknown) => typeof value === "boolean" ? !value : "changed";
    const mutations: ((s: any) => void)[] = [];
    for (const field of Object.keys(authorizedState.training.authorization).filter((f) => f !== "note")) {
      if (field === "splitHashes") {
        for (const split of ["train", "validation", "test"]) {
          mutations.push((s) => { s.training.authorization.splitHashes[split] = "0".repeat(64); });
        }
      } else {
        mutations.push((s) => { s.training.authorization[field] = changed(s.training.authorization[field]); });
        mutations.push((s) => { delete s.training.authorization[field]; });
      }
    }
    for (const field of ["trainingAuthorized", "readinessStatus", "authorizationDecisionId",
      "authorizedCodeSnapshot", "authorizedPreviewPackageId", "recipeHash",
      "authorizationQualificationHash", "authorizationEngineFreeze", "packageId", "trainingRunId"]) {
      mutations.push((s) => { s.experiments["GHARIBO-exp-001"][field] = changed(s.experiments["GHARIBO-exp-001"][field]); });
    }
    mutations.push(
      (s) => { delete s.training.authorization; },
      (s) => { s.decisions = s.decisions.filter((d: any) => d.id !== "DEC-0025"); },
      (s) => { s.decisions.find((d: any) => d.id === "DEC-0025").status = "PROPOSED"; },
      (s) => { s.training.qualification.qualificationHash = "0".repeat(64); },
      (s) => { s.training.qualification.experimentAuthorized = false; },
      (s) => { s.training.qualification.trainingLoopExecuted = true; },
      (s) => { s.training.engine.freezeLabel = "changed"; },
      (s) => { s.training.packagePreview.recipeHash = "0".repeat(64); },
      (s) => { s.training.packagePreview.testUsage = "TUNING"; },
      (s) => { s.training.packagePreview.persisted = true; },
      (s) => { s.training.packagePreview.trainingAuthorized = true; },
      (s) => { delete s.training.packagePreview; },
      (s) => { s.training.hasStarted = true; },
      (s) => { s.training.status = "RUNNING"; },
      (s) => { s.currentState.trainingHasStarted = true; },
      (s) => { s.currentState.trainingStatus = "RUNNING"; },
    );
    for (const mutation of mutations) {
      const state = structuredClone(authorizedState);
      mutation(state);
      mockGovernanceState(state);
      const reader = vi.spyOn(gold, "loadGovernedGoldSource");
      expect(isAcceptedGoldPreviewState(state)).toBe(false);
      expect(() => buildGoldPackagePreview(options)).toThrow(/DEC-0025/);
      expect(reader).not.toHaveBeenCalled();
      vi.restoreAllMocks();
    }
  });

  it("still accepts the exact legacy preauthorization snapshot", () => {
    const legacy = JSON.parse(execFileSync("git", ["show",
      "ad1e011c55729f5447b324d35b4ad88d0a47d10f:governance/GHARIBO_MASTER_STATE.json"],
    { cwd: repoRoot, encoding: "utf8" }));
    mockGovernanceState(legacy);
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(syntheticSource());
    expect(buildGoldPackagePreview(options).pkg.preview?.trainingAuthorized).toBe(false);
    legacy.experiments["GHARIBO-exp-001"].trainingAuthorized = true;
    expect(() => buildGoldPackagePreview(options)).toThrow(/DEC-0025/);
  });

  it("rejects changed runtime recipe bytes after authorization", () => {
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(syntheticSource());
    vi.spyOn(recipeModule, "goldCandidateRecipeHash").mockReturnValue("0".repeat(64));
    expect(() => buildGoldPackagePreview(options)).toThrow(/recipe identity/);
  });

  it("binds recipe, qualification, source bytes and commit to the package identity", () => {
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(syntheticSource());
    const { pkg } = buildGoldPackagePreview(options);
    for (const field of ["recipeHash", "qualificationHash", "sourceFilesHash"] as const) {
      expect(policy.computePackageId({ ...pkg, preview: { ...pkg.preview!, [field]: "0".repeat(64) } }))
        .not.toBe(pkg.packageId);
    }
    expect(policy.computePackageId({ ...pkg, gitCommitSha: "0".repeat(40) })).not.toBe(pkg.packageId);
  });

  it("blocks notebook rendering, execution bundle and DB issuance for a preview", () => {
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(syntheticSource());
    const { pkg, manifest } = buildGoldPackagePreview(options);
    expect(() => renderNotebook(pkg)).toThrow(/PREVIEW/);
    expect(() => buildBundle(pkg)).toThrow(/PREVIEW/);
    expect(() => trainingPackagesRepository.create({ manifest, experimentId: pkg.experimentId,
      datasetId: null, datasetVersionId: null, runId: null, notebookSha256: null, bundlePath: null }))
      .toThrow(/PREVIEW packages cannot be persisted/);
  });

  it("rejects invalid Gold policy and missing modern record format", () => {
    vi.spyOn(gold, "loadGovernedGoldSource").mockReturnValue(syntheticSource());
    const { pkg, manifest } = buildGoldPackagePreview(options);
    const source = syntheticSource();
    source.splitPolicy.declaredMinimumRecordsPerSplit = -1;
    const invalid = policy.finalizePackage({ ...pkg, dataset: goldDatasetRef(source) });
    expect(hasBlockingErrors(validatePackage(invalid))).toBe(true);
    const badTestPolicy = structuredClone(pkg);
    badTestPolicy.preview!.testUsage = "TUNING" as any;
    expect(hasBlockingErrors(validatePackage(badTestPolicy))).toBe(true);
    const wire = JSON.parse(manifest);
    delete wire.dataset.record_format;
    expect(hasBlockingErrors(validatePackage(policy.parseManifest(JSON.stringify(wire))))).toBe(true);
  });
});
