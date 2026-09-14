/**
 * Ollama provider — local HTTP /api/chat endpoint.
 * Streams via Ollama's native SSE format.
 */
import type { ProviderConfig, Message, ChatOptions, ChatChunk } from "@gharibo/shared";
import type { ModelProvider } from "./index";

export class OllamaProvider implements ModelProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/api/chat`;

    const body = {
      model: this.config.modelId,
      messages: [
        ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 2048,
      },
      stream: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama error ${response.status}: ${errText}`);
    }

    if (!response.body) {
      throw new Error("No response body from Ollama");
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
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.message?.content) {
            yield { delta: parsed.message.content, done: false };
          }
          if (parsed.done) {
            yield { delta: "", done: true };
            return;
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    yield { delta: "", done: true };
  }
}
