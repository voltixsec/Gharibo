/**
 * POST /api/conversations/[id]/messages — send a message, stream the response.
 *
 * Streams newline-delimited JSON events (not SSE `data:` framing, matching the
 * existing client contract):
 *
 *   {"status":"generating","modelId":"GHARIBO-V1"}   truthful progress, no tokens
 *   {"delta":"...","done":false}                     a content delta
 *   {"delta":"...","done":true}                      terminal success
 *   {"error":{"code":"...","message":"..."},"done":true}  terminal failure
 *
 * SECURITY / CORRECTNESS CONTRACT
 * -------------------------------
 * 1. A request is fully validated (routing + token budget) BEFORE anything is
 *    persisted, so a rejected request leaves no half-written conversation.
 * 2. The GHARIBO-V1 runtime sentinel is never written to `conversations.provider_id`
 *    (it has a foreign key to `providers`). Routing is resolved by
 *    `resolveConversationRoute`, which reads the persisted `model_id` identity.
 * 3. Harmony `analysis` is chain-of-thought and never leaves the runtime boundary;
 *    `runV1Chat` returns only the extracted final channel.
 * 4. The assistant message is persisted exactly once, and only for a real answer.
 */
import { NextRequest } from "next/server";
import { conversationsRepository, providersRepository } from "@/lib/db/repositories";
import { getProvider } from "@/lib/providers";
import type { Message } from "@gharibo/shared";
import { z } from "zod";
import {
  resolveV1RuntimeConfig,
  resolveRuntimeToken,
  runV1Chat,
  V1_ENV,
  V1_MODEL_ID,
  V1_RUNTIME_PROVIDER_ID,
} from "@/lib/runtime/gharibo-v1.mjs";
import { resolveConversationRoute, ROUTE_KIND } from "@/lib/runtime/routing.mjs";
import {
  deriveConversationTitle,
  DEFAULT_CONVERSATION_TITLE,
  isAutoTitleEligible,
} from "@/lib/conversation-title.mjs";
import {
  resolveDeploymentLimits,
  resolveProviderLimits,
  validateContextBudget,
  BUDGET_REASON,
} from "@/lib/runtime/deployment-limits.mjs";

const messageSchema = z.object({
  content: z.string().min(1, "content must not be empty"),
  /**
   * Legacy per-request sentinel. Only consulted for conversations created before
   * the routing contract existed (both routing columns NULL).
   */
  runtimeProviderId: z.literal(V1_RUNTIME_PROVIDER_ID).optional(),
});

/** Structured, client-renderable error. */
interface StreamError {
  code: string;
  message: string;
}

function jsonError(error: StreamError, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const conv = conversationsRepository.get(params.id);
  if (!conv) {
    return jsonError({ code: "CONVERSATION_NOT_FOUND", message: "Conversation not found." }, 404);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "MALFORMED_REQUEST", message: "Request body is not valid JSON." }, 400);
  }

  const parsed = messageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(
      {
        code: "INVALID_REQUEST",
        message: parsed.error.errors.map((e) => e.message).join("; "),
      },
      400,
    );
  }

  // -------------------------------------------------------------------------
  // Resolve routing BEFORE persisting anything.
  // -------------------------------------------------------------------------
  let v1Config: ReturnType<typeof resolveV1RuntimeConfig> | null = null;
  let v1ConfigError: Error | null = null;
  try {
    v1Config = resolveV1RuntimeConfig(process.env);
  } catch (error) {
    v1ConfigError = error instanceof Error ? error : new Error("Invalid GHARIBO-V1 runtime configuration");
  }

  // Routing an unrelated third-party provider must not depend on GHARIBO's
  // credential configuration being valid. We only need the endpoint identity
  // here; a V1-specific configuration error is surfaced later if the resolved
  // route actually targets V1.
  const v1BaseUrl =
    v1Config?.baseUrl ??
    (process.env[V1_ENV.baseUrl]?.trim() || null);

  // A conversation addresses a provider either through a real providers row, or
  // through the persisted V1 model identity. A provider row that points at the
  // V1 endpoint is still routed to V1 so the Harmony guard always applies.
  let providerConfig: ReturnType<typeof providersRepository.get> = null;
  if (conv.providerId && conv.providerId !== V1_RUNTIME_PROVIDER_ID) {
    providerConfig = providersRepository.get(conv.providerId);
  }

  const route = resolveConversationRoute({
    providerId: conv.providerId,
    modelId: conv.modelId,
    providerBaseUrl: providerConfig?.baseUrl ?? null,
    requestRuntimeProviderId: parsed.data.runtimeProviderId ?? null,
    v1BaseUrl,
  });

  if (route.kind === ROUTE_KIND.UNCONFIGURED) {
    return jsonError(
      {
        code: "NO_PROVIDER",
        message:
          "This conversation has no model selected. Choose GHARIBO-V1 or another " +
          "provider in the settings panel, then send again.",
      },
      400,
    );
  }

  if (route.kind === ROUTE_KIND.PROVIDER && !providerConfig) {
    return jsonError(
      {
        code: "PROVIDER_NOT_FOUND",
        message: `The provider configured for this conversation (${route.providerId}) no longer exists.`,
      },
      400,
    );
  }

  if (route.kind === ROUTE_KIND.V1) {
    if (v1ConfigError) {
      return jsonError(
        {
          code: "RUNTIME_CONFIG_ERROR",
          message: v1ConfigError.message,
        },
        503,
      );
    }

    if (!v1Config?.configured) {
      return jsonError(
        {
          code: "RUNTIME_NOT_CONFIGURED",
          message:
            "The GHARIBO-V1 runtime is not configured on this server. " +
            `Set ${(v1Config?.missing || []).join(" and ")}.`,
        },
        503,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Build the prompt and enforce the deployment token budget BEFORE generation.
  // -------------------------------------------------------------------------
  const history: Message[] = conv.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    }));

  const messages: Message[] = [...history, { role: "user", content: parsed.data.content }];

  const limits =
    route.kind === ROUTE_KIND.V1
      ? resolveDeploymentLimits(process.env)
      : resolveProviderLimits(providerConfig!.contextWindow, conv.maxTokens);
  const budget = validateContextBudget({
    messages,
    systemPrompt: conv.systemPrompt,
    maxTokens: conv.maxTokens,
    limits,
  });

  if (!budget.ok) {
    const status = budget.reason === BUDGET_REASON.EMPTY_REQUEST ? 400 : 413;
    return jsonError(
      {
        code: budget.reason,
        message: budget.detail,
      },
      status,
    );
  }

  // -------------------------------------------------------------------------
  // Accepted: persist the user turn exactly once, then stream.
  // -------------------------------------------------------------------------
  conversationsRepository.addMessage(params.id, {
    role: "user",
    content: parsed.data.content,
  });

  // -------------------------------------------------------------------------
  // Automatic title, derived from this first accepted user message.
  //
  // Timing matters: this runs AFTER validation (so a rejected request - bad
  // provider, bad routing, token budget - can never rename anything) and AFTER
  // the user message is persisted (so the title genuinely describes an accepted
  // turn). It is derived locally; no model call, so no GPU is woken.
  //
  // `conv` was read before this message was inserted, so "no user message yet"
  // reliably identifies the FIRST one. Only an untitled conversation is renamed,
  // and the rename is conditional in SQL, so a manual rename is authoritative
  // and concurrent first-messages cannot both win.
  // -------------------------------------------------------------------------
  let autoTitle: string | null = null;
  const isFirstUserMessage = !conv.messages.some((m) => m.role === "user");
  if (isFirstUserMessage && isAutoTitleEligible(conv.title)) {
    const derived = deriveConversationTitle(parsed.data.content);
    if (derived !== DEFAULT_CONVERSATION_TITLE) {
      const renamed = conversationsRepository.renameIfUntitled(
        params.id,
        derived,
        DEFAULT_CONVERSATION_TITLE,
      );
      // Only advertise a title we actually persisted.
      if (renamed) autoTitle = derived;
    }
  }

  const options = {
    temperature: conv.temperature,
    maxTokens: budget.maxTokens,
    systemPrompt: conv.systemPrompt ?? undefined,
    toolsEnabled: conv.toolsEnabled,
  };

  const routedProviderId = route.kind === ROUTE_KIND.V1 ? null : route.providerId;
  const routedModelId = route.kind === ROUTE_KIND.V1 ? V1_MODEL_ID : route.modelId;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let fullResponse = "";
      let isError = false;
      let persisted = false;

      /**
       * Writes one event to the client.
       *
       * A disconnected client (the user switched conversations or cancelled)
       * makes `enqueue` throw. That is NOT a generation failure: the answer may
       * still be perfectly valid, so the write is tolerated and the response is
       * persisted below regardless. Losing a real answer because the user
       * navigated away would waste the inference and lose the turn.
       */
      const send = (payload: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
        } catch {
          /* client is gone — keep going so the answer is still persisted */
        }
      };

      // Announce an automatic title first, so the sidebar and header can show it
      // immediately without an extra round trip or a page reload.
      if (autoTitle) send({ title: autoTitle });

      /**
       * Records an accepted answer.
       *
       * Called from inside the generation flow rather than after the response
       * stream finishes, so the turn is recorded even when the client has
       * navigated away. Every call site is paired with the `persisted` flag so
       * the shared tail below can never write the same answer twice.
       */
      const persistAnswer = (answer: string) => {
        conversationsRepository.addMessage(params.id, {
          role: "assistant",
          content: answer,
          modelId: routedModelId,
          providerId: routedProviderId,
        });
      };

      try {
        if (route.kind === ROUTE_KIND.V1) {
          // Truthful progress. This is NOT a fabricated token: it reports that
          // generation has started, which is exactly what is known at this point.
          send({ status: "generating", modelId: V1_MODEL_ID });

          /*
           * Generation and persistence are started here, detached from the
           * response stream.
           *
           * If the client navigates away, the framework tears this stream down
           * and the code after `await` below may never run — but this promise is
           * already in flight, so the answer is still validated and recorded.
           * (The upstream call owns its own abort signal, so it is not cancelled
           * with the client either.)
           */
          const generation = (async () => {
            // v1Config is guaranteed configured by the route guard above.
            const config = v1Config!;
            const token = resolveRuntimeToken(config, process.env);
            const extracted = await runV1Chat({ config, token, messages, options });
            if (extracted.ok && extracted.answer) {
              // Mark as recorded so the shared tail below cannot write it twice.
              persistAnswer(extracted.answer);
              persisted = true;
            }
            return extracted;
          })();

          const extracted = await generation;

          if (!extracted.ok) {
            // Fail closed: never surface raw model text, which may contain the
            // hidden analysis channel. Do NOT return from start() here: the
            // shared tail below must still close the ReadableStream, otherwise
            // clients can receive the error event and then wait forever for EOF.
            isError = true;
            send({
              error: {
                code: extracted.reason || "NO_FINAL_ANSWER",
                message:
                  "GHARIBO-V1 returned no final answer for this request. " +
                  "The response was withheld because only a validated final channel may be shown.",
              },
              done: true,
            });
          } else {
            fullResponse = extracted.answer ?? "";
            send({ delta: fullResponse, done: true });
          }
        } else {
          const provider = getProvider(providerConfig!);
          send({ status: "generating", modelId: routedModelId ?? undefined });

          for await (const chunk of provider.chat(messages, options)) {
            send({ delta: chunk.delta ?? "", done: Boolean(chunk.done) });
            if (chunk.delta) fullResponse += chunk.delta;
            if (chunk.done) break;
          }

          // Persist before anything else can throw (e.g. a closed stream).
          if (fullResponse) persistAnswer(fullResponse);
          persisted = true;
        }
      } catch (error) {
        isError = true;
        const message = error instanceof Error ? error.message : "Streaming error";
        send({ error: { code: "GENERATION_FAILED", message }, done: true });
      }

      // The V1 path persists inside its generation promise; the provider path
      // persists above. This covers any remaining path that produced a complete
      // answer but has not yet been recorded.
      if (fullResponse && !isError && !persisted) {
        persistAnswer(fullResponse);
      }

      try {
        controller.close();
      } catch {
        /* already closed by the disconnect */
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
