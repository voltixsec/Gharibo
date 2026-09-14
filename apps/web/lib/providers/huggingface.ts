/**
 * Hugging Face provider — HF Inference API client.
 * For P0 this uses the HF Inference API HTTP endpoint.
 * In-process model loading is a P1 enhancement.
 */
import type { ProviderConfig, Message, ChatOptions, ChatChunk } from "@gharibo/shared";
import type { ModelProvider } from "./index";
import { resolveKeyRef } from "@/lib/secrets";

export class HuggingFaceProvider implements ModelProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<ChatChunk> {
    const apiKey = resolveKeyRef(this.config.apiKeyRef);

    // HuggingFace Inference API for chat completions
    const url = `${this.config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;

    const body = {
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
      throw new Error(`HuggingFace error ${response.status}: ${errText}`);
    }

    // HF may return non-streaming; handle both cases
    if (response.body) {
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
    } else {
      // Non-streaming response
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? data[0]?.generated_text ?? "";
      if (content) {
        yield { delta: content, done: false };
      }
    }

    yield { delta: "", done: true };
  }
}
