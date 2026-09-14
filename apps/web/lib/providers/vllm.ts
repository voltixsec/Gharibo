/**
 * vLLM provider — OpenAI-compatible API on a local vLLM server.
 * Delegates to the OpenAI-compatible implementation with vLLM conventions.
 */
import type { ProviderConfig, Message, ChatOptions, ChatChunk } from "@gharibo/shared";
import type { ModelProvider } from "./index";
import { resolveKeyRef } from "@/lib/secrets";

export class VllmProvider implements ModelProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    const apiKey = resolveKeyRef(this.config.apiKeyRef);
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

    const body: Record<string, unknown> = {
      model: this.config.modelId,
      messages: [
        ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 2048,
      stream: true,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`vLLM error ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new Error("No response body from vLLM");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          yield { delta: "", done: true };
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            yield { delta, done: false };
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    yield { delta: "", done: true };
  }
}
