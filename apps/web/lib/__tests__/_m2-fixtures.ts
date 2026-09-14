/**
 * Shared M2 test fixtures (not a test file — excluded by the `*.test.ts` glob).
 *
 * Builds a fully-valid canonical Training Package via the production builder so
 * every downstream assertion exercises the real serializer/content-addressing.
 */
import type { DataFactoryRecord, TrainingPackage } from "@gharibo/shared";
import {
  BASE_MODEL_IDENTITY,
  BASE_MODEL_REVISION,
  LOADER_MODEL_ID,
  DEFAULT_EVALUATION_CONFIG,
  DEFAULT_HARMONY,
  finalizePackage,
  pinnedEngineConfig,
} from "@/lib/training/package";
import { defaultSplitPolicy } from "@/lib/training/split";

/** A deterministic 40-hex git sha (test-only). */
export const TEST_GIT_SHA = "0123456789abcdef0123456789abcdef01234567";

/** A deterministic 64-hex hash (test-only). */
export function fakeHash(seed: string): string {
  // 64 hex chars derived from a short seed — stable, not a real digest.
  const base = seed.padEnd(64, "0").slice(0, 64);
  return base.replace(/[^0-9a-f]/g, "a");
}

/** Builds a valid, finalized Training Package. */
export function makeValidPackage(overrides: Partial<TrainingPackage> = {}): TrainingPackage {
  const draft: Omit<TrainingPackage, "packageId"> = {
    schemaVersion: "1.0.0",
    experimentId: "GHARIBO-exp-001",
    gitCommitSha: TEST_GIT_SHA,
    baseModel: BASE_MODEL_IDENTITY,
    baseModelRevision: BASE_MODEL_REVISION,
    loaderModelId: LOADER_MODEL_ID,
    dataset: {
      datasetId: "ds-001",
      datasetVersion: "v1",
      datasetVersionId: fakeHash("1"),
      datasetHash: fakeHash("2"),
      splitHashes: {
        train: fakeHash("3"),
        validation: fakeHash("4"),
        test: fakeHash("5"),
      },
      splitPolicy: defaultSplitPolicy(),
      recordCount: 100,
    },
    engine: pinnedEngineConfig(),
    quantization: "4-bit",
    lora: {
      r: 16,
      alpha: 32,
      targetModules: ["q_proj", "v_proj"],
      dropout: 0,
      bias: "none",
    },
    method: "QLoRA + SFT",
    sequenceLength: 1024,
    batch: { perDeviceTrainBatchSize: 1, gradientAccumulationSteps: 4 },
    optimizer: "adamw_8bit",
    learningRate: 0.0002,
    epochs: null,
    maxSteps: 30,
    warmupSteps: 5,
    lrSchedulerType: "linear",
    weightDecay: 0.01,
    dtype: "fp16",
    seed: 3407,
    checkpointPolicy: {
      saveStrategy: "steps",
      saveSteps: 50,
      saveTotalLimit: 2,
      resumeFromCheckpoint: null,
    },
    artifactDestination: null,
    evaluationConfig: {
      ...DEFAULT_EVALUATION_CONFIG,
      benchmarkCategories: [...DEFAULT_EVALUATION_CONFIG.benchmarkCategories],
      researchMetrics: [...DEFAULT_EVALUATION_CONFIG.researchMetrics],
    },
    environmentMetadata: { os: "", pythonVersion: "", packages: {}, gpu: null, cuda: null },
    harmony: { ...DEFAULT_HARMONY, hiddenChannels: [...DEFAULT_HARMONY.hiddenChannels] as ["analysis"] },
    createdAt: "2026-09-14T00:00:00.000Z",
  };

  return finalizePackage({ ...draft, ...overrides } as Omit<TrainingPackage, "packageId">);
}

/** Builds a minimal Data Factory record (for canonical/hash tests). */
export function makeRecord(overrides: Partial<DataFactoryRecord> = {}): DataFactoryRecord {
  return {
    id: "rec-1",
    taskType: "qa",
    domain: "general",
    language: "en",
    input: "What is 2+2?",
    context: null,
    expectedOutput: "4",
    chosenOutput: "4",
    rejectedOutput: null,
    reasoning: null,
    source: "test",
    sourceUrl: null,
    license: null,
    verificationStatus: "TRAINING_READY",
    qualityScore: 0.9,
    difficulty: null,
    tags: ["math"],
    validationResults: [],
    sourceTrainingExampleId: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    pipelineUpdatedAt: null,
    ...overrides,
  };
}

/** Strips the server-assigned fields so a record can be passed to `create()`. */
export function toDataFactoryInput(
  record: DataFactoryRecord,
): Omit<DataFactoryRecord, "id" | "createdAt" | "updatedAt"> {
  return {
    taskType: record.taskType,
    domain: record.domain,
    language: record.language,
    input: record.input,
    context: record.context,
    expectedOutput: record.expectedOutput,
    chosenOutput: record.chosenOutput,
    rejectedOutput: record.rejectedOutput,
    reasoning: record.reasoning ?? null,
    source: record.source,
    sourceUrl: record.sourceUrl,
    license: record.license,
    verificationStatus: record.verificationStatus,
    qualityScore: record.qualityScore,
    difficulty: record.difficulty,
    tags: record.tags,
    validationResults: record.validationResults,
    sourceTrainingExampleId: record.sourceTrainingExampleId,
  };
}
