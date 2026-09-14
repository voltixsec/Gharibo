/**
 * Conversation and message types.
 * @gharibo/shared
 */

/** Quality signal assigned to a message by the user. */
export type QualitySignal = "good" | "bad" | "neutral" | null;

/** A conversation (thread) in the Playground. */
export interface Conversation {
  id: string;
  title: string;
  providerId: string | null;
  modelId: string | null;
  systemPrompt: string | null;
  temperature: number;
  maxTokens: number;
  toolsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A single message within a conversation. */
export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: "system" | "user" | "assistant";
  content: string;
  modelId: string | null;
  providerId: string | null;
  qualitySignal: QualitySignal;
  createdAt: string;
}

/** Conversation with its messages (used in GET /conversations/:id). */
export interface ConversationWithMessages extends Conversation {
  messages: ConversationMessage[];
}
