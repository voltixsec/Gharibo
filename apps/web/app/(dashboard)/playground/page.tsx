"use client";

import { useState } from "react";
import { useConversations, useConversation } from "@/hooks/use-conversations";
import { ConversationList } from "@/components/playground/conversation-list";
import { ChatView } from "@/components/playground/chat-view";
import { ChatControls } from "@/components/playground/chat-controls";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus, PanelRightClose, PanelRight, MessagesSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/status";

export default function PlaygroundPage() {
  const { toast } = useToast();
  const { conversations, createConversation, deleteConversation, loading, error } =
    useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const { conversation, loading: conversationLoading, refresh } =
    useConversation(activeId);

  const handleNew = () => {
    setShowControls(true);
  };

  const handleCreate = async (data: {
    title: string;
    providerId: string | null;
    modelId: string | null;
    systemPrompt: string | null;
    temperature: number;
    maxTokens: number;
    toolsEnabled: boolean;
  }) => {
    try {
      const conv = await createConversation({
        title: data.title,
        providerId: data.providerId,
        modelId: data.modelId,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        toolsEnabled: data.toolsEnabled,
      });
      setActiveId(conv.id);
      setShowControls(false);
      toast({ title: "Conversation created", variant: "success" });
    } catch (e) {
      toast({
        title: "Failed to create conversation",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const providerWarning = !loading && !error && conversations.length === 0;

  return (
    <>
      <PageHeader
        title="Playground"
        description="Prompt models directly and promote good turns into training examples."
        actions={
          <Button size="sm" onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            New Conversation
          </Button>
        }
        meta={
          <>
            <StatusBadge
              variant="neutral"
              label={`${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`}
            />
            {error && <StatusBadge variant="failed" label="List unavailable" />}
          </>
        }
      />

      {/*
        The playground is a three-pane workspace, so it manages its own full
        height rather than using the standard content container. Panels are
        hidden progressively so the layout stays usable at narrow widths.
      */}
      <div className="flex min-h-0 flex-1" style={{ height: "calc(100vh - 7.25rem)" }}>
        {/* Conversation list — hidden on very small screens */}
        <div className="hidden w-56 shrink-0 md:block xl:w-64">
          <ConversationList
            conversations={conversations}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={handleNew}
            onDelete={deleteConversation}
            loading={loading}
            error={error}
          />
        </div>

        {/* Chat view */}
        <div className="min-w-0 flex-1">
          <ChatView
            conversation={conversation}
            onRefresh={refresh}
            loading={conversationLoading}
          />
        </div>

        {/* Controls panel — overlay below xl, inline pane above */}
        {showControls && (
          <>
            <div
              className="fixed inset-0 z-30 bg-black/40 xl:hidden"
              onClick={() => setShowControls(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 right-0 z-40 w-80 max-w-[90vw] overflow-y-auto border-l bg-card p-4 xl:static xl:z-auto xl:w-72 xl:max-w-none xl:bg-transparent">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-semibold">New Conversation</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => setShowControls(false)}
                  aria-label="Close controls"
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              </div>
              <ChatControls onNewConversation={handleCreate} />
            </div>
          </>
        )}

        {/* Reopen controls */}
        {!showControls && (
          <Button
            size="sm"
            variant="outline"
            className="absolute right-4 top-20 z-10 xl:static xl:top-auto"
            onClick={() => setShowControls(true)}
          >
            <PanelRight className="mr-2 h-4 w-4" />
            Controls
          </Button>
        )}
      </div>

      {/* Mobile hint when no conversation is selected */}
      {!activeId && !loading && (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground md:hidden">
          <MessagesSquare className="mr-1 inline h-3 w-3" />
          Select or create a conversation to start chatting.
        </div>
      )}
    </>
  );
}
