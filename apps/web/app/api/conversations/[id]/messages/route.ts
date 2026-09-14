/**
 * POST /api/conversations/[id]/messages — send a message, stream the response.
 * Returns text/event-stream of ChatChunk. Bypasses the API envelope.
 */
import { NextRequest } from "next/server";
import { conversationsRepository, providersRepository } from "@/lib/db/repositories";
import { getProvider } from "@/lib/providers";
import type { Message, ChatChunk } from "@gharibo/shared";
import { z } from "zod";

const messageSchema = z.object({
  content: z.string().min(1),
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

  // Get the provider
  if (!conv.providerId) {
    return new Response("No provider configured for this conversation", { status: 400 });
  }
  const providerConfig = providersRepository.get(conv.providerId);
  if (!providerConfig) {
    return new Response("Provider not found", { status: 400 });
  }

  const provider = getProvider(providerConfig);

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
      try {
        for await (const chunk of provider.chat(messages, options)) {
          const data = JSON.stringify(chunk) + "\n";
          controller.enqueue(encoder.encode(data));
          if (chunk.delta) {
            fullResponse += chunk.delta;
          }
          if (chunk.done) {
            break;
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Streaming error";
        const errorChunk: ChatChunk = { delta: `Error: ${errorMsg}`, done: true };
        controller.enqueue(encoder.encode(JSON.stringify(errorChunk) + "\n"));
        fullResponse += `Error: ${errorMsg}`;
      }

      // Save assistant response
      if (fullResponse) {
        conversationsRepository.addMessage(params.id, {
          role: "assistant",
          content: fullResponse,
          modelId: conv.modelId,
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
