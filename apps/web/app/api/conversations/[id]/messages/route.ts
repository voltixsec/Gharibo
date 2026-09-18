/**
 * POST /api/conversations/[id]/messages — send a message, stream the response.
 * Returns text/event-stream of ChatChunk. Bypasses the API envelope.
 */
import { NextRequest } from "next/server";
import { conversationsRepository, providersRepository } from "@/lib/db/repositories";
import { getProvider } from "@/lib/providers";
import type { Message, ChatChunk } from "@gharibo/shared";
import { z } from "zod";
import {
  resolveV1RuntimeConfig,
  resolveRuntimeToken,
  runV1Chat,
  V1_MODEL_ID,
  V1_RUNTIME_PROVIDER_ID,
} from "@/lib/runtime/gharibo-v1.mjs";

/**
 * True when this provider IS the GHARIBO V1 runtime.
 *
 * Detected by endpoint identity rather than by a new schema field, so no
 * migration is needed and any provider pointing at the same runtime gets the
 * same guard.
 */
function isV1RuntimeProvider(baseUrl: string): boolean {
  try {
    const v1 = resolveV1RuntimeConfig(process.env);
    if (!v1.configured || !v1.baseUrl) return false;
    return baseUrl.replace(/\/+$/, "") === v1.baseUrl.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

const messageSchema = z.object({
  content: z.string().min(1),
  runtimeProviderId: z.literal(V1_RUNTIME_PROVIDER_ID).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const conv = conversationsRepository.get(params.id);
  if (!conv) {
    return new Response("Conversation not found", { status: 404 });
  }

  const body = await request.json();
  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error.errors), { status: 400 });
  }

  // Save user message
  conversationsRepository.addMessage(params.id, {
    role: "user",
    content: parsed.data.content,
  });

  // Resolve the provider. The GHARIBO V1 runtime is addressed by a sentinel id
  // that needs no DB provider row: it is driven entirely by the environment
  // (GHARIBO_V1_BASE_URL / GHARIBO_V1_API_KEY_REF), so no base URL or credential
  // is ever stored. Any other id must resolve to a real provider row.
  const effectiveProviderId =
    conv.providerId ?? parsed.data.runtimeProviderId ?? null;

  if (!effectiveProviderId) {
    return new Response("No provider configured for this conversation", { status: 400 });
  }

  const isV1Sentinel = effectiveProviderId === V1_RUNTIME_PROVIDER_ID;

  let providerConfig: ReturnType<typeof providersRepository.get> = null;
  if (!isV1Sentinel) {
    providerConfig = providersRepository.get(effectiveProviderId);
    if (!providerConfig) {
      return new Response("Provider not found", { status: 400 });
    }
  }

  const provider = isV1Sentinel ? null : getProvider(providerConfig!);

  // A conversation addresses V1 either via the sentinel id, or via a DB provider
  // whose base URL matches the configured V1 runtime endpoint.
  const v1Config = resolveV1RuntimeConfig(process.env);
  const useV1 = isV1Sentinel || (!!providerConfig && isV1RuntimeProvider(providerConfig.baseUrl));

  // Build messages array from conversation history
  const messages: Message[] = conv.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  // Add the new user message
  messages.push({ role: "user", content: parsed.data.content });

  const options = {
    temperature: conv.temperature,
    maxTokens: conv.maxTokens,
    systemPrompt: conv.systemPrompt ?? undefined,
    toolsEnabled: conv.toolsEnabled,
  };

  // Stream the response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let isError = false;
      try {
        if (useV1) {
          // GHARIBO V1 emits Harmony. `analysis` is chain-of-thought and must
          // never reach a client. The real inference call goes through the
          // canonical contract (buildV1Request + server-side token + final-channel
          // guard); only the extracted final channel may become an answer.
          if (!v1Config.configured) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  delta:
                    "GHARIBO V1 runtime is not configured. Set GHARIBO_V1_BASE_URL and GHARIBO_V1_API_KEY_REF.",
                  done: true,
                }) + "\n",
              ),
            );
            controller.close();
            return;
          }

          const token = resolveRuntimeToken(v1Config, process.env);
          const extracted = await runV1Chat({ config: v1Config, token, messages, options });

          if (extracted.ok) {
            fullResponse = extracted.answer ?? "";
            controller.enqueue(
              encoder.encode(JSON.stringify({ delta: fullResponse, done: true }) + "\n"),
            );
          } else {
            // Fail closed: never surface raw model text (which may contain the
            // analysis channel) when no final answer is present.
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  delta: `The GHARIBO V1 runtime returned no final answer (${extracted.reason}).`,
                  done: true,
                }) + "\n",
              ),
            );
            controller.close();
            return;
          }
        } else {
          for await (const chunk of provider!.chat(messages, options)) {
            const data = JSON.stringify(chunk) + "\n";
            controller.enqueue(encoder.encode(data));
            if (chunk.delta) {
              fullResponse += chunk.delta;
            }
            if (chunk.done) {
              break;
            }
          }
        }
      } catch (error) {
        isError = true;
        const errorMsg = error instanceof Error ? error.message : "Streaming error";
        const errorChunk: ChatChunk = { delta: `Error: ${errorMsg}`, done: true };
        controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + "\n"));
        fullResponse = `Error: ${errorMsg}`;
      }

      // Save the assistant response only when it is a real model answer, never
      // when the call failed or returned no final channel.
      if (fullResponse && !isError) {
        conversationsRepository.addMessage(params.id, {
          role: "assistant",
          content: fullResponse,
          modelId: useV1 ? V1_MODEL_ID : conv.modelId,
          providerId: conv.providerId,
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
