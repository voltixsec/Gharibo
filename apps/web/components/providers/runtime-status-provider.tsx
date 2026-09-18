"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared GHARIBO-V1 runtime status.
 *
 * WHY THIS IS A PROVIDER, NOT A HOOK
 * ----------------------------------
 * The runtime descriptor comes from a LIVE network probe. When each consumer
 * called `useRuntimeV1()` independently, a single Playground render fired three
 * or four concurrent probes (status badge, model selector, inspector, page).
 * That is wasteful at best and, because the runtime is a scaled-to-zero GPU
 * container, each redundant probe can wake it — which costs real money.
 *
 * One provider owns exactly one probe and one bounded warm-up poll loop; every
 * consumer reads the same state.
 *
 * POLLING POLICY
 * --------------
 *   - one probe on mount;
 *   - further probes ONLY while the runtime is WARMING, at a slow interval and
 *     for a bounded number of attempts, because that is the one state that can
 *     resolve on its own;
 *   - no polling in any terminal state (ONLINE / OFFLINE / UNAUTHORIZED / ERROR),
 *     so a healthy or genuinely down runtime is never hammered.
 */

export interface V1RuntimeDiagnostics {
  cudaAvailable: boolean;
  gpuName: string | null;
  vramTotalBytes: number | null;
  vramAllocatedBytes: number | null;
  adapterLoaded: boolean;
  adapterSha256Verified: boolean;
  baseModelLoaded: boolean;
}

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
    statusCode?: number | null;
  };
  config: {
    configured: boolean;
    baseUrlHost: string | null;
    modelId: string;
    hasCredentialReference: boolean;
    missing: string[];
  };
  diagnostics?: V1RuntimeDiagnostics | null;
}

export interface RuntimeContextValue {
  runtime: V1RuntimeStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Slow, because each probe may wake a GPU container. */
const WARMING_POLL_MS = 30_000;

/** Bounded, so a permanently-warming runtime is not polled forever. */
const MAX_WARMING_POLLS = 6;

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

export function RuntimeStatusProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<V1RuntimeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const warmingPolls = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/runtime/v1", { cache: "no-store" });
      const json = await res.json();
      if (!mounted.current) return;
      if (json?.data) {
        setRuntime(json.data as V1RuntimeStatus);
        setError(null);
      } else {
        setError("No runtime descriptor returned");
      }
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Failed to load runtime status");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  const isWarming = runtime?.health?.state === "WARMING";
  const checkedAt = runtime?.health?.checkedAt;

  useEffect(() => {
    if (!isWarming) return;
    if (warmingPolls.current >= MAX_WARMING_POLLS) return;
    warmingPolls.current += 1;
    const timer = setTimeout(refresh, WARMING_POLL_MS);
    return () => clearTimeout(timer);
  }, [isWarming, checkedAt, refresh]);

  return (
    <RuntimeContext.Provider value={{ runtime, loading, error, refresh }}>
      {children}
    </RuntimeContext.Provider>
  );
}

/** Reads the shared runtime status. Must be used inside `RuntimeStatusProvider`. */
export function useRuntimeV1(): RuntimeContextValue {
  const ctx = useContext(RuntimeContext);
  if (!ctx) {
    throw new Error("useRuntimeV1 must be used within a RuntimeStatusProvider");
  }
  return ctx;
}
