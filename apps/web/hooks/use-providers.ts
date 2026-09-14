"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProviderConfig } from "@gharibo/shared";

/** Client-side hook for fetching and managing providers. */
export function useProviders() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const json = await res.json();
      if (json.code === 0) {
        setProviders(json.data);
        setError(null);
      } else {
        setError(json.message);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { providers, loading, error, refresh };
}
