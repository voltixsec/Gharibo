/**
 * Provider abstraction types.
 * @gharibo/shared
 */

/** Supported provider backends. */
export type ProviderType = "openai_compatible" | "ollama" | "vllm" | "huggingface";

/** Full provider configuration persisted in the DB. */
export interface ProviderConfig {
  id: string;
  provider: ProviderType;
  modelId: string;
  baseUrl: string;
  /** Environment variable name that holds the raw API key; never the raw key itself. */
  apiKeyRef: string | null;
  contextWindow: number;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
  supportsReasoning: boolean;
  displayName?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Chat message role. */
export type Role = "system" | "user" | "assistant";

/** A single chat message. */
export interface Message {
  role: Role;
  content: string;
}

/** Options for a chat completion request. */
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  toolsEnabled?: boolean;
}

/** A single chunk from a streaming chat response. */
export interface ChatChunk {
  delta: string;
  done: boolean;
}
