"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GhariboMark } from "@/components/brand/gharibo-brand";
import { MarkdownLite } from "./markdown-lite";
import { cn, formatDate } from "@/lib/utils";
import {
  ThumbsUp,
  ThumbsDown,
  Plus,
  Pencil,
  GitCompare,
  Copy,
  Check,
  RotateCcw,
} from "lucide-react";
import type { ConversationMessage } from "@gharibo/shared";

interface MessageBubbleProps {
  message: ConversationMessage;
  /** The user prompt that produced this assistant turn, used by Retry. */
  promptForRetry?: string | null;
  onAddToDataset: (message: ConversationMessage) => void;
  onQualitySignal: (messageId: string, signal: "good" | "bad") => void;
  onEditApprove: (message: ConversationMessage) => void;
  onCompare: (message: ConversationMessage) => void;
  onRetry?: (prompt: string) => void;
}

export function MessageBubble({
  message,
  promptForRetry,
  onAddToDataset,
  onQualitySignal,
  onEditApprove,
  onCompare,
  onRetry,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable — no false success state */
    }
  };

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-[color:var(--gharibo-surface-elevated)] px-4 py-2.5 text-sm ring-1 ring-inset ring-border">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
        <span className="pr-1 text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
          {formatDate(message.createdAt)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      {/* Assistant identity is immediately distinguishable from the user. */}
      <GhariboMark size={30} className="mt-0.5" />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-foreground">GHARIBO-V1</span>
          {message.modelId && message.modelId !== "GHARIBO-V1" && (
            <Badge variant="outline" className="text-[0.625rem]">
              {message.modelId}
            </Badge>
          )}
          {message.qualitySignal === "good" && (
            <Badge variant="success" className="text-[0.625rem]">
              Good
            </Badge>
          )}
          {message.qualitySignal === "bad" && (
            <Badge variant="destructive" className="text-[0.625rem]">
              Bad
            </Badge>
          )}
          <span className="text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
            {formatDate(message.createdAt)}
          </span>
        </div>

        {/* Document-style response, not a bubble. */}
        <div className="min-w-0 text-foreground">
          <MarkdownLite content={message.content} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-0.5">
          <ActionButton onClick={copy} label={copied ? "Copied" : "Copy"}>
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </ActionButton>

          {onRetry && promptForRetry && (
            <ActionButton onClick={() => onRetry(promptForRetry)} label="Retry">
              <RotateCcw className="h-3 w-3" />
            </ActionButton>
          )}

          <ActionButton onClick={() => onQualitySignal(message.id, "good")} label="Good">
            <ThumbsUp className="h-3 w-3" />
          </ActionButton>

          <ActionButton onClick={() => onQualitySignal(message.id, "bad")} label="Bad">
            <ThumbsDown className="h-3 w-3" />
          </ActionButton>

          <ActionButton onClick={() => onAddToDataset(message)} label="Add to Dataset">
            <Plus className="h-3 w-3" />
          </ActionButton>

          <ActionButton onClick={() => onEditApprove(message)} label="Edit & Approve">
            <Pencil className="h-3 w-3" />
          </ActionButton>

          <ActionButton onClick={() => onCompare(message)} label="Compare">
            <GitCompare className="h-3 w-3" />
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn(
        "h-7 gap-1 px-2 text-[0.6875rem] text-muted-foreground hover:text-foreground",
      )}
      onClick={onClick}
      aria-label={label}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}
