"use client";

import { useState } from "react";
import { useConversations, useConversation } from "@/hooks/use-conversations";
import { ConversationList } from "@/components/playground/conversation-list";
import { ChatView } from "@/components/playground/chat-view";
import { ChatControls } from "@/components/playground/chat-controls";
import { Button } from "@/components/ui/button";
import { Plus, PanelRightClose, PanelRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PlaygroundPage() {
  const { toast } = useToast();
  const { conversations, createConversation, deleteConversation } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const { conversation, loading, refresh } = useConversation(activeId);

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
        // Runtime GHARIBO-V1 is not a persisted M2 provider.
        // Keep provider/model FKs null for runtime conversations.
        providerId: null,
        modelId: null,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
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

  return (
    <div className="flex h-full">
      {/* Conversation List */}
      <div className="w-64 shrink-0">
        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={handleNew}
          onDelete={deleteConversation}
        />
      </div>

      {/* Chat View */}
      <div className="flex-1">
        <ChatView conversation={conversation} onRefresh={refresh} />
      </div>

      {/* Controls Panel */}
      {showControls && (
        <div className="w-72 shrink-0 border-l p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold">New Conversation</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setShowControls(false)}
            >
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
          <ChatControls onNewConversation={handleCreate} />
        </div>
      )}

      {/* Reopen button */}
      {!showControls && (
        <Button
          size="icon"
          variant="ghost"
          className="fixed right-4 top-4 z-10"
          onClick={() => setShowControls(true)}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
