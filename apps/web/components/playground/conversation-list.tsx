"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState, ErrorState } from "@/components/status";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import type { Conversation } from "@gharibo/shared";
import { cn, timeAgo, truncate } from "@/lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  loading?: boolean;
  error?: string | null;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  loading,
  error,
}: ConversationListProps) {
  return (
    <div className="flex h-full min-w-0 flex-col border-r">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Conversations</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={onNew}
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {loading ? (
            <div className="space-y-1.5 p-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : error ? (
            <ErrorState title="Could not load conversations" message={error} />
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="No conversations yet"
              message="Create one to start prompting."
            />
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                  activeId === conv.id && "bg-accent",
                )}
                onClick={() => onSelect(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(conv.id);
                  }
                }}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate font-medium" title={conv.title}>
                    {truncate(conv.title, 40)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {timeAgo(conv.updatedAt)}
                    {conv.modelId ? ` · ${conv.modelId}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${conv.title}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
