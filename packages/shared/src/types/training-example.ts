/**
 * Training example types — saved from the Playground.
 * @gharibo/shared
 */

/** Approval state for a training example. */
export type ApprovalState = "pending" | "approved" | "rejected";

/** A training example saved from a Playground conversation. */
export interface TrainingExample {
  id: string;
  prompt: string;
  systemPrompt: string | null;
  response: string;
  approvedResponse: string | null;
  modelId: string | null;
  providerId: string | null;
  tags: string[];
  domain: string | null;
  language: string | null;
  qualityScore: number | null;
  approvalState: ApprovalState;
  sourceConversationId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}
