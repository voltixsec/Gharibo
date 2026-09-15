/** Explicit B3 pre-authorization candidate. No UI or TrainingRun defaults. */
import type { TrainingPackage } from "@gharibo/shared";
import { sha256Canonical } from "./hash";

type RecipeConfiguration = Pick<TrainingPackage,
  "baseModel" | "baseModelRevision" | "loaderModelId" | "method" | "quantization" |
  "lora" | "seed" | "sequenceLength" | "batch" | "learningRate" | "epochs" |
  "maxSteps" | "optimizer" | "warmupSteps" | "lrSchedulerType" | "weightDecay" |
  "dtype" | "checkpointPolicy" | "artifactDestination" | "harmony" | "evaluationConfig"
>;

const RECIPE = {
  id: "gharibo-gold-b3-candidate-v1",
  status: "PRE_AUTHORIZATION_CANDIDATE",
  trainRecords: 640,
  // Definition timestamp, not a claim that a run/package was created at this time.
  definedAt: "2026-09-15T00:00:00.000Z",
  policySources: [
    "apps/web/lib/training/package.ts#Policy defaults (Q2/Q3/O1)",
    "docs/adr/ADR-0019-governed-gold-package-preview.md",
  ],
  configuration: {
    baseModel: "openai/gpt-oss-20b",
    baseModelRevision: "6cee5e81ee83917806bbde320786a8fb61efebee",
    loaderModelId: "unsloth/gpt-oss-20b",
    method: "QLoRA + SFT",
    quantization: "4-bit",
    lora: { r: 16, alpha: 32, targetModules: ["q_proj", "v_proj"], dropout: 0, bias: "none" },
    seed: 42,
    sequenceLength: 512,
    batch: { perDeviceTrainBatchSize: 1, gradientAccumulationSteps: 4 },
    learningRate: 0.0002,
    epochs: 1,
    maxSteps: null,
    optimizer: "adamw_8bit",
    warmupSteps: 5,
    lrSchedulerType: "linear",
    weightDecay: 0.01,
    dtype: "fp16",
    checkpointPolicy: {
      saveStrategy: "steps", saveSteps: 50, saveTotalLimit: 2, resumeFromCheckpoint: null,
    },
    artifactDestination: null,
    harmony: {
      developerTemplateId: "research-structured-knowledge",
      reasoningEffort: "medium",
      hiddenChannels: ["analysis"],
    },
    evaluationConfig: {
      executed: false,
      status: "NOT_RUN",
      benchmarkCategories: ["Reasoning", "Instruction Following", "Structured Output", "Research",
        "Source Fidelity", "Hallucination Resistance"],
      researchMetrics: ["schema_correctness", "record_precision", "duplicate_rate",
        "unsupported_claim_rate", "source_coverage", "taxonomy_accuracy"],
    },
  } satisfies RecipeConfiguration,
};

export function goldCandidateRecipe(): typeof RECIPE {
  return structuredClone(RECIPE);
}

export function goldCandidateRecipeHash(): string {
  return sha256Canonical(RECIPE);
}
