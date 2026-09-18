"use client";

import { useRuntimeV1 } from "@/hooks/use-runtime-v1";

/**
 * Truthful GHARIBO-V1 runtime status badge.
 *
 * Shows the real health of the V1 runtime (a live probe). It never claims the
 * runtime is ready when it is not, and never labels a self-hosted development
 * endpoint as production. This is the UI's honest "inference unavailable" face.
 */
export function RuntimeStatusBadge() {
  const { runtime, loading, error } = useRuntimeV1();

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-muted-foreground" />
        GHARIBO-V1: checking…
      </span>
    );
  }

  if (error || !runtime) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        GHARIBO-V1: status unknown
      </span>
    );
  }

  const { health, config } = runtime;
  const host = runtime.endpointHost ?? config.baseUrlHost ?? "—";

  if (!config.configured) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-400"
        title={`Missing: ${(config.missing || []).join(", ")}`}
      >
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        GHARIBO-V1: not configured ({host})
      </span>
    );
  }

  if (health.ok) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-600 dark:text-emerald-400"
        title={health.detail}
      >
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        GHARIBO-V1: development runtime online ({host})
      </span>
    );
  }

  const label =
    health.state === "UNAUTHORIZED"
      ? "unauthorized"
      : health.state === "OFFLINE"
        ? "offline"
        : health.state === "ERROR"
          ? "config error"
          : "unavailable";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs text-destructive"
      title={health.detail}
    >
      <span className="h-2 w-2 rounded-full bg-destructive" />
      GHARIBO-V1: {label} ({host})
    </span>
  );
}
