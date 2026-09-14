/**
 * Research Gym types.
 * @gharibo/shared
 */

/** Entity types in the structured-knowledge schema. */
export type ResearchEntityType =
  | "CATEGORY"
  | "DOMAIN"
  | "SYSTEM"
  | "MANUFACTURER"
  | "BRAND"
  | "PRODUCT_FAMILY"
  | "PRODUCT_MODEL"
  | "ITEM"
  | "SERVICE"
  | "RELATION"
  | "SOURCE"
  | "EVIDENCE";

/** A candidate entity discovered during research. */
export interface CandidateEntity {
  type: ResearchEntityType;
  name: string;
  parentId?: string;
  attributes?: Record<string, unknown>;
}

/** A source considered during research. */
export interface ResearchSource {
  url?: string;
  title?: string;
  snippet?: string;
  accessedAt?: string;
}

/** A generated structured record from research. */
export interface GeneratedRecord {
  entityType: ResearchEntityType;
  data: Record<string, unknown>;
  sourceIds: string[];
  verified: boolean;
}

/** A validation failure from the research task. */
export interface ResearchValidationFailure {
  recordId: string;
  validator: string;
  message: string;
}

/** A research training record — persisted for every research run. */
export interface ResearchRecord {
  id: string;
  task: string;
  instructions: string | null;
  input: string | null;
  sourcesConsidered: ResearchSource[];
  sourceSnippets: string[];
  candidateEntities: CandidateEntity[];
  generatedRecords: GeneratedRecord[];
  validationFailures: ResearchValidationFailure[];
  duplicatesFound: string[];
  corrections: string[];
  finalApprovedRecords: GeneratedRecord[];
  rewardScore: number | null;
  modelUsed: string | null;
  duration: number | null;
  createdAt: string;
}

/** Payload for POST /api/research — run a research task. */
export interface ResearchRunRequest {
  task: string;
  input: string;
  modelUsed?: string;
}
