"use client";

import { useState, useMemo, useEffect } from "react";
import { useConversations, useConversation } from "@/hooks/use-conversations";
import { useProviders } from "@/hooks/use-providers";
import { RuntimeStatusProvider, useRuntimeV1 } from "@/components/providers/runtime-status-provider";
import { ConversationSidebar } from "@/components/playground/conversation-sidebar";
import { ChatView, COMPOSER_ID } from "@/components/playground/chat-view";
import { SkipLink } from "@/components/skip-link";
import { Inspector, type RequestMetrics } from "@/components/playground/inspector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsDesktop } from "@/hooks/use-media-query";
import {
  V1_MODEL_ID,
  V1_RUNTIME_PROVIDER_ID,
} from "@/lib/runtime/gharibo-v1.mjs";
import { targetFromSelection } from "@/lib/runtime/routing.mjs";
import { resolveDeploymentLimits } from "@/lib/runtime/deployment-limits.mjs";
import { Menu, X } from "lucide-react";
import type { ConversationMessage } from "@gharibo/shared";

export default function PlaygroundPage() {
  return (
    <RuntimeStatusProvider>
      <PlaygroundContent />
    </RuntimeStatusProvider>
  );
}

function PlaygroundContent() {
  const { toast } = useToast();
  const {
    conversations,
    loading: listLoading,
    createConversation,
    patchConversation,
    renameConversation,
    deleteConversation,
  } = useConversations();
  const { providers } = useProviders();
  const { runtime, loading: runtimeLoading } = useRuntimeV1();

  const [activeId, setActiveId] = useState<string | null>(null);
  /** Desktop side-panel preference. Defaults open, as a wide screen has room. */
  const [inspectorOpen, setInspectorOpen] = useState(true);
  /**
   * Mobile/tablet drawer visibility, tracked separately and defaulting CLOSED.
   *
   * Sharing one flag with the desktop panel made the drawer render open on first
   * paint at narrow widths, covering the entire conversation.
   */
  const [inspectorDrawerOpen, setInspectorDrawerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [metrics, setMetrics] = useState<RequestMetrics | null>(null);
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [compareSource, setCompareSource] = useState<ConversationMessage | null>(null);
  const [compareTarget, setCompareTarget] = useState<string>(V1_RUNTIME_PROVIDER_ID);
  const [busy, setBusy] = useState(false);

  const { conversation, refresh } = useConversation(activeId);
  const limits = resolveDeploymentLimits({});
  const isDesktop = useIsDesktop();

  /**
   * Escape closes whichever drawer is open.
   *
   * The drawers are plain overlays rather than Radix dialogs, so they get no
   * built-in dismissal. Without this a keyboard user had to Tab to the close
   * button to get out.
   */
  useEffect(() => {
    if (!sidebarOpen && !inspectorDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      setInspectorDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen, inspectorDrawerOpen]);

  /** One affordance, two meanings: collapse the panel, or open the drawer. */
  const toggleInspector = () => {
    if (isDesktop) setInspectorOpen((v) => !v);
    else setInspectorDrawerOpen((v) => !v);
  };

  const v1Configured = !!runtime?.config?.configured;
  const activeProviders = useMemo(() => providers.filter((p) => p.isActive), [providers]);

  /** Default selection: GHARIBO-V1 when available, else the first provider. */
  const defaultSelection = useMemo(() => {
    if (v1Configured) return V1_RUNTIME_PROVIDER_ID;
    return activeProviders[0]?.id ?? null;
  }, [v1Configured, activeProviders]);

  // Adopt the default selection once the runtime/provider lists have loaded.
  //
  // This MUST wait for the runtime descriptor. Without the gate, the very first
  // render (when the descriptor is still null and `v1Configured` is therefore
  // false) latched onto the first active provider, and the selector never
  // switched to GHARIBO-V1 once the descriptor arrived — so the app silently
  // defaulted to a third-party provider.
  useEffect(() => {
    if (runtimeLoading) return;
    if (selectionKey === null && defaultSelection !== null) {
      setSelectionKey(defaultSelection);
    }
  }, [selectionKey, defaultSelection, runtimeLoading]);

  const compareTargetIsValid =
    (compareTarget === V1_RUNTIME_PROVIDER_ID && v1Configured) ||
    activeProviders.some((provider) => provider.id === compareTarget);

  useEffect(() => {
    if (compareTargetIsValid) return;
    if (v1Configured) {
      setCompareTarget(V1_RUNTIME_PROVIDER_ID);
    } else if (activeProviders[0]) {
      setCompareTarget(activeProviders[0].id);
    }
  }, [compareTargetIsValid, v1Configured, activeProviders]);

  /**
   * Reflect the ACTIVE CONVERSATION's own routing in the inspector.
   *
   * This is what makes the selector truthful: it shows where the open
   * conversation actually routes, not a global default that the conversation
   * does not use.
   */
  useEffect(() => {
    if (!conversation) return;
    if (conversation.providerId) setSelectionKey(conversation.providerId);
    else if (conversation.modelId === V1_MODEL_ID) setSelectionKey(V1_RUNTIME_PROVIDER_ID);
  }, [conversation?.id, conversation?.providerId, conversation?.modelId, conversation]);

  const selectionProvider = activeProviders.find((p) => p.id === selectionKey) ?? null;
  const toolsSupported = selectionProvider?.supportsTools ?? false;
  const isV1Selection = selectionKey === V1_RUNTIME_PROVIDER_ID;
  const selectedMaxTokenCeiling = isV1Selection
    ? limits.maxOutputTokensCeiling
    : (selectionProvider?.contextWindow ?? limits.maxOutputTokensCeiling);
  const newConversationMaxTokens = isV1Selection
    ? limits.defaultMaxOutputTokens
    : Math.min(2048, selectedMaxTokenCeiling);
  const modelLabel =
    selectionKey === V1_RUNTIME_PROVIDER_ID
      ? V1_MODEL_ID
      : (selectionProvider?.displayName || selectionProvider?.modelId || "No model");

  const handleNew = async () => {
    if (!selectionKey) {
      toast({
        title: "No model available",
        description:
          "Configure the GHARIBO-V1 runtime or add a provider before starting a conversation.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      // The sentinel is converted here, so it can never reach provider_id.
      const target = targetFromSelection(selectionKey, selectionProvider);
      const conv = await createConversation({
        title: "New conversation",
        providerId: target.providerId,
        modelId: target.modelId,
        systemPrompt: null,
        temperature: 0.7,
        maxTokens: newConversationMaxTokens,
        toolsEnabled: false,
      });
      setActiveId(conv.id);
      setMetrics(null);
      setSidebarOpen(false);
    } catch (e) {
      toast({
        title: "Failed to create conversation",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
    setMetrics(null);
    setSidebarOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteConversation(id);
      if (activeId === id) setActiveId(null);
    } catch (e) {
      toast({
        title: "Failed to delete conversation",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      await renameConversation(id, title);
      if (conversation?.id === id) refresh();
    } catch (e) {
      toast({
        title: "Failed to rename conversation",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handleSelectionChange = async (key: string) => {
    // With no active conversation this is just the default for the next chat.
    if (!conversation) {
      setSelectionKey(key);
      return;
    }

    const provider = activeProviders.find((p) => p.id === key) ?? null;
    const target = targetFromSelection(key, provider);
    try {
      await patchConversation(conversation.id, {
        providerId: target.providerId,
        modelId: target.modelId,
      });
      // Do not make the selector claim a route until persistence succeeded.
      setSelectionKey(key);
      refresh();
    } catch (e) {
      toast({
        title: "Failed to change model",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  };

  const handlePatch = async (patch: {
    systemPrompt?: string | null;
    temperature?: number;
    maxTokens?: number;
  }): Promise<boolean> => {
    if (!conversation) return false;
    try {
      await patchConversation(conversation.id, patch);
      refresh();
      return true;
    } catch (e) {
      toast({
        title: "Failed to save settings",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
      return false;
    }
  };

  /**
   * Compare the selected prompt against a different model.
   *
   * This deliberately starts a FRESH conversation with the same system prompt
   * and generation settings, then re-sends only the prompt that produced the
   * selected response. Earlier chat history is not copied, so the UI must not
   * describe this as a full conversation branch.
   */
  const handleCompareConfirm = async () => {
    if (!conversation || !compareSource) return;
    const messages = conversation.messages;
    const index = messages.findIndex((m) => m.id === compareSource.id);
    const prompt = index > 0 && messages[index - 1].role === "user" ? messages[index - 1].content : null;
    if (!prompt) {
      toast({ title: "Nothing to compare", variant: "destructive" });
      setCompareSource(null);
      return;
    }

    setBusy(true);
    try {
      const provider = activeProviders.find((p) => p.id === compareTarget) ?? null;
      const target = targetFromSelection(compareTarget, provider);
      const branch = await createConversation({
        title: `${conversation.title} · compare`,
        providerId: target.providerId,
        modelId: target.modelId,
        systemPrompt: conversation.systemPrompt,
        temperature: conversation.temperature,
        maxTokens: conversation.maxTokens,
        toolsEnabled: false,
      });
      setSelectionKey(compareTarget);
      setActiveId(branch.id);
      setPendingPrompt(prompt);
      setCompareSource(null);
    } catch (e) {
      toast({
        title: "Failed to start comparison",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {/*
        Playground-level bypass (WCAG 2.4.1). The conversation list is long - one
        row per conversation, each with rename and delete controls - so reaching
        the composer by Tab alone takes dozens of presses.
      */}
      <SkipLink href={`#${COMPOSER_ID}`}>Skip to message composer</SkipLink>

      {/* ------------------------------------------------- sidebar (desktop) */}
      <div className="hidden w-72 shrink-0 lg:block">
        <ConversationSidebar
          conversations={conversations}
          activeId={activeId}
          loading={listLoading}
          onSelect={handleSelect}
          onNew={handleNew}
          onDelete={handleDelete}
          onRename={handleRename}
        />
      </div>

      {/* -------------------------------------------------- sidebar (drawer) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <ConversationSidebar
              conversations={conversations}
              activeId={activeId}
              loading={listLoading}
              onSelect={handleSelect}
              onNew={handleNew}
              onDelete={handleDelete}
              onRename={handleRename}
              onCollapse={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile toolbar: opens the conversation list drawer. */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
          >
            <Menu className="h-4 w-4" />
            Conversations
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          <ChatView
            conversation={conversation}
            onRefresh={refresh}
            onRename={(title) => {
              if (conversation) void handleRename(conversation.id, title);
            }}
            onCompare={setCompareSource}
            onMetrics={setMetrics}
            onToggleInspector={toggleInspector}
            /* On mobile the drawer is transient, so the toggle must stay visible. */
            inspectorOpen={isDesktop ? inspectorOpen : false}
            modelLabel={modelLabel}
            toolsSupported={toolsSupported}
            pendingPrompt={pendingPrompt}
            onPendingPromptConsumed={() => setPendingPrompt(null)}
          />
        </div>
      </div>

      {/* -------------------------------------------- inspector (desktop) */}
      {inspectorOpen && (
        <div className="hidden w-72 shrink-0 border-l border-border xl:block">
          <Inspector
            conversation={conversation}
            selectionKey={selectionKey}
            onSelectionChange={handleSelectionChange}
            onPatch={handlePatch}
            toolsSupported={toolsSupported}
            maxTokenCeiling={selectedMaxTokenCeiling}
            isV1Selection={isV1Selection}
            metrics={metrics}
          />
        </div>
      )}

      {/* --------------------------------------------- inspector (drawer) */}
      {inspectorDrawerOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setInspectorDrawerOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[85vw] bg-[color:var(--gharibo-surface)]">
            <div className="flex items-center justify-end border-b border-border px-3 py-2">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setInspectorDrawerOpen(false)}
                aria-label="Close inspector"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="h-[calc(100%-3rem)]">
              <Inspector
                conversation={conversation}
                selectionKey={selectionKey}
                onSelectionChange={handleSelectionChange}
                onPatch={handlePatch}
                toolsSupported={toolsSupported}
                maxTokenCeiling={selectedMaxTokenCeiling}
                isV1Selection={isV1Selection}
                metrics={metrics}
              />
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- compare dialog */}
      <Dialog open={!!compareSource} onOpenChange={(open) => !open && setCompareSource(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare prompt with another model</DialogTitle>
            <DialogDescription>
              Runs the same prompt in a fresh conversation with the same system
              prompt and generation settings. Earlier chat history is not copied,
              so this compares the prompt-level answer rather than the full
              multi-turn context.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5 py-2">
            <Label>Target model</Label>
            <Select value={compareTarget} onValueChange={setCompareTarget}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {v1Configured && (
                  <SelectItem value={V1_RUNTIME_PROVIDER_ID}>GHARIBO-V1</SelectItem>
                )}
                {activeProviders.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.displayName || p.modelId} ({p.provider})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareSource(null)}>
              Cancel
            </Button>
            <Button onClick={handleCompareConfirm} disabled={busy || !compareTargetIsValid}>
              Create comparison
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
