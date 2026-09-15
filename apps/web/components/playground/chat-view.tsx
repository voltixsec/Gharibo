"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { TrainingExampleDialog } from "./training-example-dialog";
import { EmptyState, ErrorState, StatusBadge } from "@/components/status";
import { Send, MessagesSquare } from "lucide-react";
import type { ConversationMessage, ConversationWithMessages } from "@gharibo/shared";

interface ChatViewProps {
  conversation: ConversationWithMessages | null;
  onRefresh: () => void;
  loading?: boolean;
}

export function ChatView({ conversation, onRefresh, loading }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [dialogMessage, setDialogMessage] = useState<ConversationMessage | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation?.messages, streamingContent]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !conversation || streaming) return;

    const content = input;
    setInput("");
    setSendError(null);
    setStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error(`Request failed with HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Response body was not readable");
      }

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep any trailing partial line for the next chunk.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.delta) {
              setStreamingContent((prev) => prev + chunk.delta);
            }
            if (chunk.error) {
              setSendError(String(chunk.error));
            }
            if (chunk.done) {
              setStreaming(false);
              onRefresh();
              return;
            }
          } catch {
            // Malformed partial line — ignore and keep streaming.
          }
        }
      }
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "The message could not be sent.",
      );
    } finally {
      setStreaming(false);
      onRefresh();
    }
  };

  const handleQualitySignal = async (messageId: string, signal: "good" | "bad") => {
    await fetch(`/api/conversations/${conversation?.id}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualitySignal: signal }),
    });
    onRefresh();
  };

  const handleAddToDataset = (message: ConversationMessage) => {
    setDialogMessage(message);
  };

  const handleEditApprove = (message: ConversationMessage) => {
    setDialogMessage(message);
  };

  const handleCompare = (message: ConversationMessage) => {
    // Compare opens the same dialog for editing.
    setDialogMessage(message);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted border-t-foreground" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<MessagesSquare className="h-7 w-7" />}
          title="No conversation selected"
          message="Create a new conversation to start prompting. The selected model and tool setting are stored with the conversation."
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Header — shows the conversation's REAL stored model and tool setting */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-semibold">
            {conversation.title}
          </h2>
          {conversation.modelId ? (
            <StatusBadge
              variant="neutral"
              label={conversation.modelId}
              detail="Model stored with this conversation"
            />
          ) : (
            <StatusBadge
              variant="not-started"
              label="No model recorded"
              detail="This conversation was created without a model selection"
            />
          )}
          <StatusBadge
            variant={conversation.toolsEnabled ? "running" : "not-started"}
            label={conversation.toolsEnabled ? "Tools on" : "Tools off"}
          />
        </div>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          temp {conversation.temperature} · max {conversation.maxTokens} tokens
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef as never}>
        <div className="flex flex-col gap-4 p-4">
          {conversation.messages.length === 0 && !streaming && (
            <EmptyState
              title="No messages yet"
              message="Send the first message to begin."
            />
          )}
          {conversation.messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onAddToDataset={handleAddToDataset}
              onQualitySignal={handleQualitySignal}
              onEditApprove={handleEditApprove}
              onCompare={handleCompare}
            />
          ))}
          {streaming && streamingContent && (
            <div className="flex flex-col items-start gap-1">
              <div className="max-w-[85%] rounded-lg bg-muted px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap break-words">
                  {streamingContent}
                </p>
              </div>
            </div>
          )}
          {streaming && !streamingContent && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
              <span>Generating…</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Send error — surfaced inline rather than only in the console */}
      {sendError && (
        <div className="shrink-0 px-4 pb-2">
          <ErrorState
            title="Message failed"
            message={sendError}
            onRetry={() => setSendError(null)}
          />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="shrink-0 border-t p-4">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              conversation.modelId
                ? `Message ${conversation.modelId}…`
                : "Type a message…"
            }
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {dialogMessage && (
        <TrainingExampleDialog
          message={dialogMessage}
          conversation={conversation}
          onClose={() => setDialogMessage(null)}
          onSaved={() => {
            setDialogMessage(null);
          }}
        />
      )}
    </div>
  );
}
