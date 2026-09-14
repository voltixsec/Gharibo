"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "./message-bubble";
import { TrainingExampleDialog } from "./training-example-dialog";
import { Send } from "lucide-react";
import type { ConversationMessage, ConversationWithMessages } from "@gharibo/shared";

interface ChatViewProps {
  conversation: ConversationWithMessages | null;
  onRefresh: () => void;
}

export function ChatView({ conversation, onRefresh }: ChatViewProps) {
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [dialogMessage, setDialogMessage] = useState<ConversationMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
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
    setStreaming(true);
    setStreamingContent("");

    try {
      const res = await fetch(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              if (chunk.delta) {
                setStreamingContent((prev) => prev + chunk.delta);
              }
              if (chunk.done) {
                setStreaming(false);
                onRefresh();
                return;
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    } catch (e) {
      console.error("Chat error:", e);
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
    // Compare opens the same dialog for editing
    setDialogMessage(message);
  };

  if (!conversation) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h3 className="text-lg font-medium">No conversation selected</h3>
          <p className="text-sm text-muted-foreground">
            Create a new conversation to start chatting.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{conversation.title}</h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef as any}>
        <div className="flex flex-col gap-4 p-4">
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
              <div className="max-w-[80%] rounded-lg bg-muted px-4 py-3 text-sm">
                <p className="whitespace-pre-wrap">{streamingContent}</p>
              </div>
            </div>
          )}
          {streaming && !streamingContent && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
              <span>Generating...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t p-4">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={streaming}
          />
          <Button type="submit" size="icon" disabled={streaming || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>

      {/* Training Example Dialog */}
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
