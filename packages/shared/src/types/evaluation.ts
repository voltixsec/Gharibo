/**
 * Evaluation result types.
 * @gharibo/shared
 */

/** Benchmark categories for model evaluation. */
export type BenchmarkCategory =
  | "Reasoning"
  | "Coding"
  | "Instruction Following"
  | "Structured Output"
  | "Research"
  | "Source Fidelity"
  | "Hallucination Resistance"
  | "Data Extraction"
  | "Classification"
  | "Deduplication"
  | "Tool Use";

/** Research Gym-specific metrics. */
export type ResearchMetric =
  | "schema_correctness"
  | "record_precision"
  | "duplicate_rate"
  | "unsupported_claim_rate"
  | "source_coverage"
  | "taxonomy_accuracy";

/** An evaluation result for a model on a benchmark category. */
export interface EvaluationResult {
  id: string;
  modelId: string;
  benchmarkCategory: BenchmarkCategory;
  score: number | null;
  baseModelScore: number | null;
  regressions: string[];
  createdAt: string;
}
