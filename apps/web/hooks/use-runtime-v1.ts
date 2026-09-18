"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * Client-side hook for the GHARIBO V1 runtime descriptor.
 *
 * Reads the truthful runtime status from `/api/runtime/v1` (a live health
 * probe). It NEVER reports the runtime as available unless the probe actually
 * reached it, and it never reports production hosting.
 */
export interface V1RuntimeStatus {
  modelId: string;
  hostingLabel: string;
  isProduction: boolean;
  endpointHost: string | null;
  health: {
    state: string;
    ok: boolean;
    detail: string;
    checkedAt: string;
  };
  config: {
    configured: boolean;
    baseUrlHost: string | null;
    modelId: string;
    hasCredentialReference: boolean;
    missing: string[];
  };
}

export function useRuntimeV1() {
  const [runtime, setRuntime] = useState<V1RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/runtime/v1");
      const json = await res.json();
      if (json?.data) {
        setRuntime(json.data as V1RuntimeStatus);
        setError(null);
      } else {
        setError("No runtime descriptor returned");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load runtime status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { runtime, loading, error, refresh };
}
