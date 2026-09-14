"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThumbsUp, ThumbsDown, Plus, Pencil, GitCompare } from "lucide-react";
import type { ConversationMessage } from "@gharibo/shared";
import { cn } from "@/lib/utils";

interface MessageBubbleProps {
  message: ConversationMessage;
  onAddToDataset: (message: ConversationMessage) => void;
  onQualitySignal: (messageId: string, signal: "good" | "bad") => void;
  onEditApprove: (message: ConversationMessage) => void;
  onCompare: (message: ConversationMessage) => void;
}

export function MessageBubble({
  message,
  onAddToDataset,
  onQualitySignal,
  onEditApprove,
  onCompare,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div className={cn("flex flex-col gap-1", isUser ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3 text-sm",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>

      {isAssistant && (
        <div className="flex items-center gap-1">
          {message.qualitySignal === "good" && (
            <Badge variant="success" className="text-xs">
              Good
            </Badge>
          )}
          {message.qualitySignal === "bad" && (
            <Badge variant="destructive" className="text-xs">
              Bad
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onAddToDataset(message)}
          >
            <Plus className="h-3 w-3" />
            Add to Dataset
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onQualitySignal(message.id, "good")}
          >
            <ThumbsUp className="h-3 w-3" />
            Good
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onQualitySignal(message.id, "bad")}
          >
            <ThumbsDown className="h-3 w-3" />
            Bad
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onEditApprove(message)}
          >
            <Pencil className="h-3 w-3" />
            Edit &amp; Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => onCompare(message)}
          >
            <GitCompare className="h-3 w-3" />
            Compare
          </Button>
        </div>
      )}
    </div>
  );
}
