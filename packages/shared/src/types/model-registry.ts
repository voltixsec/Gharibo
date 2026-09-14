/**
 * Model registry types.
 * @gharibo/shared
 */

/** Model lifecycle status — gates promotion. */
export type ModelStatus = "EXPERIMENT" | "CANDIDATE" | "ACCEPTED" | "DEPRECATED";

/** A model registry entry — the single source of truth for model versions. */
export interface ModelRegistryEntry {
  id: string;
  modelName: string;
  version: string;
  baseModel: string | null;
  trainingRunId: string | null;
  datasetVersion: string | null;
  trainingMethod: string | null;
  checkpointLocation: string | null;
  adapterLocation: string | null;
  evaluationScore: Record<string, unknown>;
  status: ModelStatus;
  notes: string | null;
  createdDate: string;
  updatedAt: string;
}
