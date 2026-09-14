/**
 * ModelProvider interface + getProvider factory.
 * All provider implementations return an AsyncIterable<ChatChunk> for streaming.
 */
import type { ProviderConfig, Message, ChatOptions, ChatChunk, ProviderType } from "@gharibo/shared";
import { resolveKeyRef } from "@/lib/secrets";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { OllamaProvider } from "./ollama";
import { VllmProvider } from "./vllm";
import { HuggingFaceProvider } from "./huggingface";

/** The provider abstraction contract. */
export interface ModelProvider {
  readonly config: ProviderConfig;
  /** Streams chat completion chunks. */
  chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk>;
}

/**
 * Factory: returns the correct provider implementation for a given config.
 * @throws Error if the provider type is unknown.
 */
export function getProvider(config: ProviderConfig): ModelProvider {
  switch (config.provider as ProviderType) {
    case "openai_compatible":
      return new OpenAICompatibleProvider(config);
    case "ollama":
      return new OllamaProvider(config);
    case "vllm":
      return new VllmProvider(config);
    case "huggingface":
      return new HuggingFaceProvider(config);
    default:
      throw new Error(`Unknown provider type: ${config.provider}`);
  }
}

/** Resolves the API key for a provider config (server-side only). */
export function resolveApiKey(config: ProviderConfig): string | null {
  return resolveKeyRef(config.apiKeyRef);
}

export type { ProviderConfig, Message, ChatOptions, ChatChunk };
