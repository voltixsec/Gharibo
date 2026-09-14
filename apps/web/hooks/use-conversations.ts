"use client";

import { useState, useEffect, useCallback } from "react";
import type { Conversation, ConversationWithMessages } from "@gharibo/shared";

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

  const createConversation = useCallback(async (data: {
    title: string;
    providerId?: string | null;
    modelId?: string | null;
    systemPrompt?: string | null;
    temperature?: number;
    maxTokens?: number;
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
  }, [refresh]);

  const deleteConversation = useCallback(async (id: string) => {
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { conversations, loading, error, refresh, createConversation, deleteConversation };
}

/** Client-side hook for fetching a single conversation with messages. */
export function useConversation(id: string | null) {
  const [conversation, setConversation] = useState<ConversationWithMessages | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) {
      setConversation(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const json = await res.json();
      if (json.code === 0) {
        setConversation(json.data);
      } else {
        setConversation(null);
      }
    } catch {
      setConversation(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { conversation, loading, refresh, setConversation };
}
