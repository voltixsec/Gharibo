"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MessageBubble } from "./message-bubble";
import { TrainingExampleDialog } from "./training-example-dialog";
import { RuntimeStatusBadge } from "./runtime-status-badge";
import { EmptyState } from "./empty-state";
import { Composer } from "./composer";
import { GhariboOrbit } from "@/components/brand/gharibo-brand";
import { V1_MODEL_ID, V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";
import { NdjsonStreamParser, STREAM_EVENT } from "@/lib/runtime/stream-parser.mjs";
import { resolveDeploymentLimits } from "@/lib/runtime/deployment-limits.mjs";
import { cn } from "@/lib/utils";
import { AlertCircle, Check, Pencil, PanelRight } from "lucide-react";
import type { ConversationMessage, ConversationWithMessages } from "@gharibo/shared";
import type { RequestMetrics } from "./inspector";

/**
 * DOM id of the composer region.
 *
 * Exported so the Playground's skip link can jump to it: a keyboard user would
 * otherwise Tab through the navigation rail and every conversation row first.
 */
export const COMPOSER_ID = "gharibo-composer";

interface ChatViewProps {
  conversation: ConversationWithMessages | null;
  onRefresh: () => void;
  onRename: (title: string) => void;
  onCompare: (message: ConversationMessage) => void;
  onMetrics: (metrics: RequestMetrics) => void;
  onToggleInspector: () => void;
  inspectorOpen: boolean;
  /** Model label shown as a chip in the composer. */
  modelLabel: string;
  /** True when the routed target declares tool support. */
  toolsSupported: boolean;
  /**
   * A prompt to send automatically once the current conversation is ready.
   * Used by the Compare flow, which branches a conversation to another model.
   */
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
}

/** A structured failure surfaced to the user. */
interface Notice {
  tone: "error" | "warning";
  message: string;
}

export function ChatView({
  conversation,
  onRefresh,
  onRename,
  onCompare,
  onMetrics,
  onToggleInspector,
  inspectorOpen,
  modelLabel,
  toolsSupported,
  pendingPrompt,
  onPendingPromptConsumed,
}: ChatViewProps) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialogMessage, setDialogMessage] = useState<ConversationMessage | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const limits = resolveDeploymentLimits({});

  const conversationId = conversation?.id ?? null;

  /**
   * The conversation the UI is currently showing.
   *
   * Read by in-flight requests after every await so a superseded request can
   * never write state into a conversation it does not belong to.
   */
  const currentConversationIdRef = useRef<string | null>(conversationId);

  /**
   * Reset all transient state when the active conversation changes.
   *
   * This is what prevents a previous conversation's in-flight response, error
   * notice or partial content from leaking into the newly selected one.
   */
  useEffect(() => {
    currentConversationIdRef.current = conversationId;
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    setStreamingContent("");
    setNotice(null);
    setInput("");
    setDialogMessage(null);
    setEditingTitle(false);
  }, [conversationId]);

  // Abort any in-flight request when the component unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  // Keep the newest content in view.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [conversation?.messages, streamingContent, busy]);

  const send = useCallback(
    async (rawPrompt: string) => {
      const prompt = rawPrompt.trim();
      if (!prompt || !conversationId || busy) return;

      // The conversation this request belongs to. Every post-await state write
      // is guarded against it, so switching conversations cannot let this
      // request's result, error or progress surface anywhere else.
      const owningConversationId = conversationId;

      setInput("");
      setBusy(true);
      setStreamingContent("");
      setNotice(null);

      const controller = new AbortController();
      abortRef.current = controller;

      const startedAt = performance.now();
      let ttfbMs: number | null = null;
      let accumulated = "";
      let terminal = false;

      try {
        const body: Record<string, unknown> = { content: prompt };

        /*
         * Legacy fallback.
         *
         * Conversations created before the routing contract existed have
         * NEITHER routing column set. They were always served by GHARIBO-V1
         * (the old client sent the sentinel unconditionally), so the sentinel is
         * sent for them and only them. Conversations created by the current UI
         * carry `modelId: "GHARIBO-V1"` or a real `providerId`, so they resolve
         * on their own and no sentinel is needed.
         *
         * This keeps existing conversations working without rewriting any data.
         */
        if (!conversation?.providerId && !conversation?.modelId) {
          body.runtimeProviderId = V1_RUNTIME_PROVIDER_ID;
        }

        const res = await fetch(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          // The route validates routing and the token budget BEFORE persisting,
          // so a rejected request leaves the conversation untouched.
          const payload = await res.json().catch(() => null);
          const message =
            payload?.error?.message ??
            `The request was rejected (HTTP ${res.status}).`;
          if (currentConversationIdRef.current === owningConversationId) {
            setNotice({ tone: "error", message });
          }
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setNotice({ tone: "error", message: "The response stream was unavailable." });
          return;
        }

        const decoder = new TextDecoder();
        const parser = new NdjsonStreamParser();

        const handleEvents = (events: ReturnType<NdjsonStreamParser["push"]>) => {
          for (const event of events) {
            if (event.type === STREAM_EVENT.DELTA) {
              if (ttfbMs === null) ttfbMs = Math.round(performance.now() - startedAt);
              accumulated += event.delta ?? "";
              setStreamingContent(accumulated);
              if (event.done) terminal = true;
            } else if (event.type === STREAM_EVENT.STATUS) {
              if (ttfbMs === null) ttfbMs = Math.round(performance.now() - startedAt);
            } else if (event.type === STREAM_EVENT.ERROR) {
              setNotice({
                tone: event.error?.code === "NO_FINAL_ANSWER" ? "warning" : "error",
                message: event.error?.message ?? "The runtime reported an error.",
              });
              terminal = true;
            } else if (event.type === STREAM_EVENT.DONE) {
              terminal = true;
            }
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          handleEvents(parser.push(decoder.decode(value, { stream: true })));
        }
        // Surface a truncated final record rather than dropping it.
        handleEvents(parser.flush());
      } catch (error) {
        // A superseded request reports nothing: the conversation it belonged to
        // is no longer on screen, and a stale notice must not appear in the new
        // one.
        if (currentConversationIdRef.current === owningConversationId) {
          if (error instanceof DOMException && error.name === "AbortError") {
            // Truthful: the server keeps generating and still persists a valid
            // answer, so "not saved" would be a lie.
            setNotice({
              tone: "warning",
              message:
                "Stopped waiting for this response. The runtime may still be " +
                "generating; if it returns a valid answer it will be saved to " +
                "this conversation.",
            });
          } else {
            setNotice({
              tone: "error",
              message:
                error instanceof Error ? `Network error: ${error.message}` : "Network error.",
            });
          }
        }
      } finally {
        abortRef.current = null;
        // Latency is a property of the request, so it is always reported.
        onMetrics({
          ttfbMs,
          totalMs: Math.round(performance.now() - startedAt),
          at: new Date().toISOString(),
        });
        if (currentConversationIdRef.current === owningConversationId) {
          setBusy(false);
          setStreamingContent("");
          onRefresh();
        }
      }
    },
    [
      conversationId,
      busy,
      onMetrics,
      onRefresh,
      // Routing identity of the active conversation (used by the legacy fallback).
      conversation?.providerId,
      conversation?.modelId,
    ],
  );

  /**
   * Auto-send a prompt handed over by the Compare flow.
   *
   * Guarded by a ref so the same prompt is never sent twice, even if the parent
   * re-renders before the callback clears it.
   */
  const consumedPromptRef = useRef<string | null>(null);
  useEffect(() => {
    if (!pendingPrompt || !conversationId || busy) return;
    if (consumedPromptRef.current === pendingPrompt) return;
    consumedPromptRef.current = pendingPrompt;
    onPendingPromptConsumed?.();
    send(pendingPrompt);
  }, [pendingPrompt, conversationId, busy, send, onPendingPromptConsumed]);

  // useCallback so the memoised MessageBubble is not invalidated every render.
  const handleQualitySignal = useCallback(
    async (messageId: string, signal: "good" | "bad") => {
      await fetch(`/api/conversations/${conversationId}/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qualitySignal: signal }),
      });
      onRefresh();
    },
    [conversationId, onRefresh],
  );

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next && next !== conversation?.title) onRename(next);
    setEditingTitle(false);
  };

  const messages = conversation?.messages ?? [];
  /*
   * The hero is shown only when there is genuinely nothing to show. Keeping it
   * visible while a first reply is being generated would hide the progress
   * indicator and make the app look frozen.
   */
  const showEmpty = !conversation || (messages.length === 0 && !busy);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--gharibo-surface)]">
      {/* ---------------------------------------------------------- header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {conversation ? (
            editingTitle ? (
              <div className="flex items-center gap-1">
                <Input
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  className="h-7 w-56 text-sm"
                  autoFocus
                  aria-label="Conversation title"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={commitTitle}
                  aria-label="Save title"
                >
                  <Check className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <button
                className="group flex min-w-0 items-center gap-1.5"
                onClick={() => {
                  setTitleDraft(conversation.title);
                  setEditingTitle(true);
                }}
                aria-label="Rename conversation"
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {conversation.title}
                </span>
                <Pencil className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            )
          ) : (
            <span className="text-sm font-medium text-muted-foreground">GHARIBO-V1</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <RuntimeStatusBadge />
          {!inspectorOpen && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={onToggleInspector}
                  aria-label="Show inspector"
                >
                  <PanelRight className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Show inspector</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------- messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {showEmpty ? (
          <EmptyState onPickPrompt={(prompt) => setInput(prompt)} />
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.map((msg, index) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                promptForRetry={
                  msg.role === "assistant"
                    ? (messages[index - 1]?.role === "user"
                        ? messages[index - 1].content
                        : null)
                    : null
                }
                onAddToDataset={setDialogMessage}
                onQualitySignal={handleQualitySignal}
                onEditApprove={setDialogMessage}
                onCompare={onCompare}
                onRetry={send}
              />
            ))}

            {busy && (
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  {streamingContent ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {streamingContent}
                    </p>
                  ) : (
                    <GhariboOrbit label="Generating with GHARIBO-V1…" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/*
        Failure banner.

        Deliberately OUTSIDE the message area: a rejected request leaves the
        conversation EMPTY (nothing is persisted), so a notice rendered inside
        the message list was never visible in exactly the case that produces it
        most often — an oversized prompt, a budget rejection, or a runtime that
        is not reachable. Here it is always shown, above the composer.
      */}
      {notice && (
        <div className="border-t border-border bg-[color:var(--gharibo-surface)] px-4 pt-3">
          <div
            className={cn(
              "mx-auto flex max-w-3xl gap-2.5 rounded-lg border p-3 text-xs",
              notice.tone === "error"
                ? "border-destructive/30 bg-destructive/8 text-destructive"
                : "border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300",
            )}
            role="alert"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p className="leading-relaxed">{notice.message}</p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- composer */}
      <Composer
        value={input}
        onChange={setInput}
        onSend={() => send(input)}
        onStop={() => abortRef.current?.abort()}
        busy={busy}
        canStop={busy}
        disabled={!conversation}
        disabledReason="Create or select a conversation to start."
        modelLabel={modelLabel}
        tokenBudget={conversation?.maxTokens ?? limits.defaultMaxOutputTokens}
        regionId={COMPOSER_ID}
      />

      {dialogMessage && conversation && (
        <TrainingExampleDialog
          message={dialogMessage}
          conversation={conversation}
          onClose={() => setDialogMessage(null)}
          onSaved={() => setDialogMessage(null)}
        />
      )}
    </div>
  );
}
