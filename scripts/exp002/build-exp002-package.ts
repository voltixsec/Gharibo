#!/usr/bin/env node
/**
 * Builds the governed GHARIBO-exp-002 Training Package and its executable Kaggle
 * notebook, and emits the launch summary.
 *
 * This is a PREPARATION step. It does not launch anything, does not authorize
 * anything, and does not touch a GPU. It produces the exact artifacts a human
 * authorizes.
 *
 * Run with:
 *   npx vite-node --config apps/web/vitest.config.ts scripts/exp002/build-exp002-package.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { TrainingPackage } from "@gharibo/shared";
import { TRAINING_PACKAGE_SCHEMA_VERSION } from "@gharibo/shared";
import { computePackageId, toManifest } from "@/lib/training/package";
import { renderNotebook } from "@/lib/workers/kaggle/notebook-render";
import {
  BASE_MODEL_ID,
  BASE_MODEL_REVISION,
  CHECKPOINT_POLICY,
  EXP002_ID,
  ENGINE_FREEZE,
  EXP002_SPLIT,
  EXPECTED_RUNTIME,
  GOVERNED_CHAT_TEMPLATE_SHA256,
  GOVERNED_FINAL_CHANNEL,
  GOVERNED_REASONING_EFFORT,
  GOVERNED_ROLE_SEQUENCE,
  GOVERNED_SYSTEM_DATE,
  GOVERNED_TERMINATOR,
  HYPERPARAMETERS,
  IGNORE_INDEX,
  LOADER_MODEL_ID,
  LOADER_MODEL_REVISION,
  MEASURED_MAX_RENDERED_TOKENS,
  SEQUENCE_LENGTH,
  canonicalJson,
  exp002Mode,
  pilotRecipeDefinition,
  pilotRecipeHash,
  recipeDefinition,
  recipeHash,
} from "@/lib/training/exp002-recipe.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PREFLIGHT_PATH = resolve(REPO_ROOT, "data/derived/exp002/preflight.json");

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function main() {
  const modeArg = process.argv.find((a) => a.startsWith("--mode="));
  const mode = (modeArg ? modeArg.split("=")[1] : "production") as "pilot" | "production";
  if (mode !== "pilot" && mode !== "production") {
    throw new Error(`unknown mode: ${mode}. Use --mode=pilot or --mode=production.`);
  }

  const cfg = exp002Mode(mode);
  const OUT_DIR = resolve(REPO_ROOT, `data/derived/exp002/package-${mode}`);
  const effectiveRecipeHash = mode === "pilot" ? pilotRecipeHash() : recipeHash();

  const preflight = JSON.parse(readFileSync(PREFLIGHT_PATH, "utf8"));

  if (preflight.verdict !== "PASS") {
    throw new Error(
      `REFUSING to build a package: the EXP-002 preflight verdict is ${preflight.verdict}. ` +
        `Failed gates: ${(preflight.failedGates || []).join(", ")}`,
    );
  }

  // DETERMINISM. The package is a content-addressed artifact and its manifest is
  // embedded in the rendered notebook, so a wall-clock timestamp would make the
  // notebook sha256 change on every build and the recorded artifact hashes
  // meaningless. The creation instant is therefore a declared, reproducible
  // value, overridable explicitly when a new package is genuinely issued.
  const createdAt =
    process.env.GHARIBO_PACKAGE_CREATED_AT ?? "2026-09-17T00:00:00.000Z";

  const pkg: TrainingPackage = {
    schemaVersion: TRAINING_PACKAGE_SCHEMA_VERSION,
    packageId: "",
    experimentId: cfg.experimentId,
    gitCommitSha: process.env.GHARIBO_GIT_SHA ?? "uncommitted",
    baseModel: BASE_MODEL_ID,
    baseModelRevision: BASE_MODEL_REVISION,
    loaderModelId: LOADER_MODEL_ID,
    loaderModelRevision: LOADER_MODEL_REVISION,
    dataset: {
      datasetId: "GHARIBO-Research-Gold-v0.1",
      recordFormat: "harmony-messages-v1",
      datasetVersion: `exp002-${mode}-split-v1`,
      datasetVersionId: cfg.splitHash,
      datasetHash: cfg.splitHash,
      splitHashes: {
        train: cfg.splitHash,
        validation: EXP002_SPLIT.dev.splitHash,
        test: EXP002_SPLIT.consumedTest.splitHash,
      },
      splitPolicy: {
        algorithm: "seeded-sha256-content-hash-with-audit-quarantine",
        seed: 20260917,
        ratios: { train: 0.7778, validation: 0.1111, test: 0.1111 },
        minimumRecordsPerSplit: null,
        method:
          `EXP-002 ${mode} payload, seed 20260917. ` +
          (mode === "pilot"
            ? "Deterministic prefix of the governed train ordering (100 rows). Non-promotable pipeline validation only."
            : "Re-split of Gold v0.1 TRAIN+VALIDATION (720 rows). qualification = last 80 of the hash-keyed ordering; dev = last 80 of the remainder."),
        lineHashAlgorithm: "sha256(utf-8(raw line bytes, trailing CR stripped))",
        splitHashAlgorithm: "sha256(utf-8('\\n'.join(sorted(lineHash(r) for r in S))))",
        auditQuarantine: {
          auditSeed: 3407,
          auditCohortSize: 100,
          quarantinedInto: ["train", "validation"],
          testAudited: 0,
        },
        testHeldOut: true,
        testPolicy:
          "The Gold v0.1 TEST split was consumed by Evaluation Attempt #6 (DEC-0048) and is " +
          "never used again. The EXP-002 qualification split is sealed until the V1 promotion gate.",
      },
      recordCount: cfg.rows,
    },
    // SOURCE OF TRUTH: the governed freeze set. An EMPTY dependency list makes
    // the notebook's install plan resolve to `uv pip install` with no package
    // argument, which exits 2. That is exactly how pilot Kaggle Version 2 failed
    // in SETUP. Never leave this empty.
    engine: {
      engine: ENGINE_FREEZE.engine,
      engineVersion: ENGINE_FREEZE.engineVersion,
      dependencies: ENGINE_FREEZE.dependencies.map((d) => ({
        name: d.name,
        source: d.source as "pip" | "git",
        spec: d.spec,
        resolvedVersion: d.resolvedVersion,
        url: d.url,
      })),
    },
    quantization: "4-bit",
    lora: {
      r: HYPERPARAMETERS.lora.r,
      alpha: HYPERPARAMETERS.lora.alpha,
      targetModules: ["q_proj", "k_proj", "v_proj", "o_proj"],
      dropout: HYPERPARAMETERS.lora.dropout,
      bias: HYPERPARAMETERS.lora.bias as "none",
    },
    method: "QLoRA + SFT",
    sequenceLength: SEQUENCE_LENGTH,
    batch: {
      perDeviceTrainBatchSize: HYPERPARAMETERS.perDeviceTrainBatchSize,
      gradientAccumulationSteps: HYPERPARAMETERS.gradientAccumulationSteps,
    },
    optimizer: HYPERPARAMETERS.optimizer,
    learningRate: HYPERPARAMETERS.learningRate,
    epochs: HYPERPARAMETERS.epochs,
    maxSteps: HYPERPARAMETERS.maxSteps,
    warmupSteps: HYPERPARAMETERS.warmupSteps,
    lrSchedulerType: HYPERPARAMETERS.lrSchedulerType,
    weightDecay: HYPERPARAMETERS.weightDecay,
    // SOURCE OF TRUTH: the governed recipe. Never hardcode this. Pilot Version 1
    // failed pre-training precisely because this line said "fp16" while the
    // recipe and the notebook both said "float32".
    dtype: HYPERPARAMETERS.dtype as TrainingPackage["dtype"],
    seed: HYPERPARAMETERS.seed,
    checkpointPolicy: {
      saveStrategy: "steps",
      saveSteps: cfg.checkpointPolicy.saveSteps,
      saveTotalLimit: cfg.checkpointPolicy.saveTotalLimit,
      resumeFromCheckpoint: null,
    },
    artifactDestination: null,
    evaluationConfig: {
      executed: false,
      status: "NOT_RUN",
      benchmarkCategories: [
        "Reasoning",
        "Instruction Following",
        "Structured Output",
        "Research",
        "Source Fidelity",
        "Hallucination Resistance",
      ],
      researchMetrics: [
        "schema_correctness",
        "record_precision",
        "duplicate_rate",
        "unsupported_claim_rate",
        "source_coverage",
        "taxonomy_accuracy",
      ],
    },
    environmentMetadata: {
      os: "posix",
      pythonVersion: "3.11",
      packages: {},
      gpu: "NVIDIA T4",
      cuda: null,
    },
    harmony: {
      developerTemplateId: "research-structured-knowledge",
      reasoningEffort: "medium",
      hiddenChannels: ["analysis"],
    },
    exp002: {
      recipeHash: effectiveRecipeHash,
      governedChatTemplateSha256: GOVERNED_CHAT_TEMPLATE_SHA256,
      governedReasoningEffort: GOVERNED_REASONING_EFFORT,
      governedSystemDate: GOVERNED_SYSTEM_DATE,
      roleSequence: GOVERNED_ROLE_SEQUENCE,
      finalChannel: GOVERNED_FINAL_CHANNEL,
      terminator: GOVERNED_TERMINATOR,
      ignoreIndex: IGNORE_INDEX,
      declaredDtype: HYPERPARAMETERS.dtype as TrainingPackage["dtype"],
      declaredDtype: HYPERPARAMETERS.dtype as TrainingPackage["dtype"],
      lossContract: {
        kind: "ASSISTANT_ONLY_EXPLICIT_LABEL_MASK",
        reliesOnTrainerDefault: false,
        collator: "AssistantOnlyCollator",
        failClosedOnZeroSupervisedRow: true,
      },
      splits: {
        train: {
          file: "train.jsonl",
          rows: cfg.rows,
          splitHash: cfg.splitHash,
        },
        dev: {
          file: "dev.jsonl",
          rows: cfg.devRows,
          splitHash: EXP002_SPLIT.dev.splitHash,
        },
        qualification: {
          file: "qualification.jsonl",
          rows: EXP002_SPLIT.qualification.rows,
          splitHash: EXP002_SPLIT.qualification.splitHash,
          readPolicy: "SEALED_UNTIL_V1_PROMOTION_GATE",
        },
        splitSeed: EXP002_SPLIT.seed,
      },
      consumedTest: {
        splitHash: EXP002_SPLIT.consumedTest.splitHash,
        reusableAsPromotionEvidence: false,
      },
      contextPolicy: {
        chosenContextLength: SEQUENCE_LENGTH,
        measuredMaxRenderedTokens: MEASURED_MAX_RENDERED_TOKENS,
        rule: "smallest candidate context with zero partial and zero zero-visibility assistant spans",
      },
      qualificationSealed: true,
    },
    createdAt,
  };

  pkg.packageId = computePackageId(pkg);

  const manifest = toManifest(pkg);
  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";

  const notebook = renderNotebook(pkg);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "package-manifest.json"), manifestJson, "utf8");
  writeFileSync(resolve(OUT_DIR, notebook.filename), notebook.content, "utf8");

  // ---------------------------------------------------------------- launch summary
  const payloadDir = resolve(OUT_DIR, "dataset");
  mkdirSync(payloadDir, { recursive: true });
  const payloadFiles: Array<{ name: string; bytes: number; sha256: string }> = [];
  const payloadSources: Array<{ name: string; source: string }> = [
    { name: "train.jsonl", source: cfg.splitPath },
    ...(mode === "production"
      ? [{ name: "dev.jsonl", source: EXP002_SPLIT.dev.path }]
      : []),
  ];
  for (const { name, source: sourceRel } of payloadSources) {
    const source = resolve(REPO_ROOT, sourceRel);
    if (!existsSync(source)) throw new Error(`missing payload split: ${source}`);
    const content = readFileSync(source);
    writeFileSync(resolve(payloadDir, name), content);
    payloadFiles.push({ name, bytes: content.length, sha256: sha256(content.toString("utf8")) });
  }

  const launchSummary = {
    artifactKind: "GHARIBO_EXP002_LAUNCH_SUMMARY",
    schemaVersion: "1.0.0",
    experimentId: cfg.experimentId,
    mode,
    packageId: pkg.packageId,
    recipeHash: effectiveRecipeHash,
    recipeDefinitionHash: sha256(
      canonicalJson(mode === "pilot" ? pilotRecipeDefinition() : recipeDefinition()),
    ),
    notebook: { filename: notebook.filename, sha256: notebook.sha256 },
    packageManifestSha256: sha256(manifestJson),
    datasetIdentities: {
      datasetId: "GHARIBO-Research-Gold-v0.1",
      splitSeed: EXP002_SPLIT.seed,
      splits: {
        train: { rows: cfg.rows, splitHash: cfg.splitHash },
        dev: { rows: cfg.devRows, splitHash: EXP002_SPLIT.dev.splitHash },
        qualification: {
          rows: EXP002_SPLIT.qualification.rows,
          splitHash: EXP002_SPLIT.qualification.splitHash,
          sealed: true,
          presentInPayload: false,
        },
        consumedTest: {
          splitHash: EXP002_SPLIT.consumedTest.splitHash,
          presentInPayload: false,
          reusableAsPromotionEvidence: false,
        },
      },
      payloadFiles,
    },
    expectedResources: EXPECTED_RUNTIME,
    testAbsent: true,
    qualificationAbsent: true,
    goldAnswersForScoringAbsent: true,
    preflight: { path: "data/derived/exp002/preflight.json", verdict: preflight.verdict },
    authorizedLaunches: 0,
    maximumKernelPushes: 1,
    authorizationRequired: true,
    authorizationPhrase: "AUTHORIZE EXP-002 TRAINING LAUNCH",
  };

  const summaryJson = JSON.stringify(launchSummary, null, 2) + "\n";
  writeFileSync(resolve(OUT_DIR, "launch-summary.json"), summaryJson, "utf8");

  console.log("EXP-002 " + mode.toUpperCase() + " package built (PREPARATION ONLY - nothing launched)");
  console.log("=".repeat(70));
  console.log("experiment id     :", cfg.experimentId);
  console.log("mode              :", mode);
  console.log("package id        :", pkg.packageId);
  console.log("recipe hash       :", effectiveRecipeHash);
  console.log("notebook          :", notebook.filename, notebook.sha256.slice(0, 16));
  console.log("sequence length   :", SEQUENCE_LENGTH);
  console.log("train rows        :", cfg.rows);
  console.log("dev rows          :", cfg.devRows);
  console.log("qualification     : SEALED, absent from payload");
  console.log("consumed TEST     : absent from payload");
  console.log("");
  console.log("wrote:", OUT_DIR);
  for (const file of ["package-manifest.json", notebook.filename, "launch-summary.json"]) {
    console.log("  -", file);
  }
  for (const { name } of payloadSources) console.log("  - dataset/" + name);
}

main();
