"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Conversation, ConversationWithMessages } from "@gharibo/shared";

/** Fields that can be patched on a conversation. */
export interface ConversationPatch {
  title?: string;
  providerId?: string | null;
  modelId?: string | null;
  systemPrompt?: string | null;
  temperature?: number;
  maxTokens?: number;
  toolsEnabled?: boolean;
}

/** Client-side hook for conversation list management. */
export function useConversations() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/conversations");
      const json = await res.json();
      if (json.code === 0) {
        setConversations(json.data);
        setError(null);
      } else {
        setError(json.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  const createConversation = useCallback(
    async (data: {
      title: string;
      providerId?: string | null;
      modelId?: string | null;
      systemPrompt?: string | null;
      temperature?: number;
      maxTokens?: number;
      toolsEnabled?: boolean;
    }) => {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.code === 0) {
        await refresh();
        return json.data as Conversation;
      }
      throw new Error(json.message);
    },
    [refresh],
  );

  const patchConversation = useCallback(
    async (id: string, patch: ConversationPatch) => {
      const res = await fetch(`/api/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.code === 0) {
        await refresh();
        return json.data as Conversation;
      }
      throw new Error(json.message);
    },
    [refresh],
  );

  const renameConversation = useCallback(
    (id: string, title: string) => patchConversation(id, { title }),
    [patchConversation],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    conversations,
    loading,
    error,
    refresh,
    createConversation,
    patchConversation,
    renameConversation,
    deleteConversation,
  };
}

/** Client-side hook for fetching a single conversation with messages. */
export function useConversation(id: string | null) {
  const [conversation, setConversation] = useState<ConversationWithMessages | null>(null);
  const [loading, setLoading] = useState(true);
  // Monotonic request generation: when the user switches conversations faster
  // than the network responds, an older response must never overwrite the newer
  // selection.
  const refreshGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++refreshGeneration.current;

    if (!id) {
      setConversation(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const json = await res.json();
      if (generation !== refreshGeneration.current) return;
      if (json.code === 0) {
        setConversation(json.data);
      } else {
        setConversation(null);
      }
    } catch {
      if (generation === refreshGeneration.current) {
        setConversation(null);
      }
    } finally {
      if (generation === refreshGeneration.current) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    /*
     * Clear BEFORE fetching.
     *
     * `refresh` only assigns once the response lands, so without this the
     * PREVIOUS conversation's messages stayed rendered under the NEW
     * conversation's header while the request was in flight — a visible
     * cross-conversation leak on any non-instant connection.
     */
    setConversation(null);
    refresh();

    // Invalidate any in-flight response from this id as soon as the selection
    // changes or the hook unmounts.
    return () => {
      refreshGeneration.current += 1;
    };
  }, [refresh]);

  return { conversation, loading, refresh, setConversation };
}
