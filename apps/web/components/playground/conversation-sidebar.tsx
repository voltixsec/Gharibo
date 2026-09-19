"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GhariboLogo } from "@/components/brand/gharibo-brand";
import { cn, timeAgo } from "@/lib/utils";
import { Plus, Search, MessageSquare, Trash2, Pencil, Check, X, PanelLeftClose } from "lucide-react";
import type { Conversation } from "@gharibo/shared";

interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCollapse?: () => void;
}

/** Groups conversations into recency buckets, newest first. */
function groupByRecency(conversations: Conversation[]) {
  const now = Date.now();
  const day = 86_400_000;
  const groups: Array<{ label: string; items: Conversation[] }> = [
    { label: "Today", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const age = now - new Date(conv.updatedAt).getTime();
    if (age < day) groups[0].items.push(conv);
    else if (age < day * 7) groups[1].items.push(conv);
    else groups[2].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading = false,
  onSelect,
  onNew,
  onDelete,
  onRename,
  onCollapse,
}: ConversationSidebarProps) {
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupByRecency(filtered), [filtered]);

  const startRename = (conv: Conversation) => {
    setRenamingId(conv.id);
    setRenameValue(conv.title);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-[color:var(--gharibo-surface-sunken)]">
      {/* Brand */}
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-4">
        <GhariboLogo size={32} />
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={onCollapse}
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse sidebar</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* New conversation */}
      <div className="px-3 pt-3">
        <Button
          onClick={onNew}
          className="w-full justify-start gap-2 bg-[color:var(--gharibo-cyan)]/12 text-[color:var(--gharibo-cyan)] hover:bg-[color:var(--gharibo-cyan)]/20"
          variant="ghost"
        >
          <Plus className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      {/* Search */}
      <div className="relative px-3 pt-3">
        <Search className="pointer-events-none absolute left-5 top-1/2 mt-1.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations"
          className="h-9 pl-8 text-sm"
          aria-label="Search conversations"
        />
      </div>

      {/* List */}
      <ScrollArea className="mt-2 min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-2 pb-4">
          {loading && conversations.length === 0 && (
            <div className="flex flex-col gap-2 px-1 pt-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 animate-pulse rounded-md bg-muted/60" />
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              {query ? "No conversations match that search." : "No conversations yet."}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--gharibo-text-subtle)]">
                {group.label}
              </p>
              {group.items.map((conv) => {
                const isActive = activeId === conv.id;
                const isRenaming = renamingId === conv.id;
                const isConfirming = confirmDeleteId === conv.id;

                return (
                  <div
                    key={conv.id}
                    className={cn(
                      "group relative flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      isActive
                        ? "bg-[color:var(--gharibo-cyan)]/12 text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {isActive && (
                      <span className="gharibo-edge absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full" />
                    )}

                    {!isRenaming && (
                      <MessageSquare
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive && "text-[color:var(--gharibo-cyan)]",
                        )}
                      />
                    )}

                    {isRenaming ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="h-7 flex-1 text-xs"
                          autoFocus
                          aria-label="Conversation title"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={commitRename}
                          aria-label="Save title"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => setRenamingId(null)}
                          aria-label="Cancel rename"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="flex min-w-0 flex-1 flex-col items-start text-left"
                          onClick={() => onSelect(conv.id)}
                        >
                          <span className="w-full truncate font-medium">{conv.title}</span>
                          <span className="text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
                            {timeAgo(conv.updatedAt)}
                          </span>
                        </button>

                        {isConfirming ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-destructive"
                              onClick={() => {
                                onDelete(conv.id);
                                setConfirmDeleteId(null);
                              }}
                              aria-label="Confirm delete"
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Cancel delete"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startRename(conv);
                                  }}
                                  aria-label={`Rename ${conv.title}`}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Rename</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDeleteId(conv.id);
                                  }}
                                  aria-label={`Delete ${conv.title}`}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete</TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
