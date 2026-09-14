"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";
import type { Conversation } from "@gharibo/shared";
import { cn, timeAgo, truncate } from "@/lib/utils";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationListProps) {
  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold">Conversations</span>
        <Button size="sm" variant="outline" onClick={onNew}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1 p-2">
          {conversations.length === 0 ? (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No conversations yet
            </p>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex cursor-pointer items-start gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent",
                  activeId === conv.id && "bg-accent",
                )}
                onClick={() => onSelect(conv.id)}
              >
                <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-medium">
                    {truncate(conv.title, 40)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {timeAgo(conv.updatedAt)}
                  </p>
                </div>
                <button
                  className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(conv.id);
                  }}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
