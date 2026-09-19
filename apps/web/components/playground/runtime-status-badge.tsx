"use client";

import { useRuntimeV1 } from "@/components/providers/runtime-status-provider";
import { cn } from "@/lib/utils";

/**
 * Truthful GHARIBO-V1 runtime status pill.
 *
 * Reports the REAL state of the V1 runtime (a live probe). It never claims the
 * runtime is ready when it is not, never labels a self-hosted development
 * endpoint as production, and never reports a cold-starting container as
 * "offline" — a GPU container that is still booting is WARMING, not down.
 *
 * The brand cyan/blue language carries the non-semantic states (checking,
 * warming, online). Green is reserved for genuine success, amber for a
 * configuration gap, red for a real failure.
 */

type Tone = "neutral" | "brand" | "warming" | "success" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-[color:var(--gharibo-cyan)]/12 text-[color:var(--gharibo-cyan)]",
  warming: "bg-[color:var(--gharibo-cyan)]/12 text-[color:var(--gharibo-cyan)]",
  // emerald-700 / amber-700 in light mode: the 600 shades measure ~3.6:1 on
  // white, below the WCAG AA 4.5:1 threshold for small text.
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
  warning: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
  danger: "bg-destructive/12 text-destructive",
};

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-muted-foreground",
  brand: "bg-[color:var(--gharibo-cyan)]",
  warming: "bg-[color:var(--gharibo-cyan)]",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-destructive",
};

function Pill({
  tone,
  label,
  title,
  pulse = false,
}: {
  tone: Tone;
  label: React.ReactNode;
  title?: string;
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium",
        TONE_CLASS[tone],
      )}
      title={title}
      role="status"
    >
      <span className="relative flex h-1.5 w-1.5 shrink-0">
        {pulse && (
          <span
            className={cn(
              "gharibo-animate-pulse-ring absolute inline-flex h-full w-full rounded-full",
              DOT_CLASS[tone],
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", DOT_CLASS[tone])} />
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * The endpoint host, shown only where there is room for it.
 *
 * On a phone the full Modal host made the badge wider than the header and
 * wrapped the conversation title onto two lines.
 */
function Host({ host }: { host: string }) {
  return <span className="hidden md:inline"> ({host})</span>;
}

export function RuntimeStatusBadge({ compact = false }: { compact?: boolean }) {
  const { runtime, loading, error } = useRuntimeV1();

  if (loading && !runtime) {
    return <Pill tone="neutral" label="GHARIBO-V1 · checking" pulse />;
  }

  if (error || !runtime) {
    return <Pill tone="danger" label="GHARIBO-V1 · status unknown" title={error ?? undefined} />;
  }

  const { health, config } = runtime;
  const host = runtime.endpointHost ?? config.baseUrlHost ?? "—";

  if (!config.configured) {
    return (
      <Pill
        tone="warning"
        label="GHARIBO-V1 · not configured"
        title={`Missing: ${(config.missing || []).join(", ")}`}
      />
    );
  }

  if (health.ok) {
    return (
      <Pill
        tone="success"
        label={compact ? "Online" : <>GHARIBO-V1 · online<Host host={host} /></>}
        title={health.detail}
      />
    );
  }

  switch (health.state) {
    case "WARMING":
      return (
        <Pill
          tone="warming"
          label={compact ? "Warming" : <>GHARIBO-V1 · warming<Host host={host} /></>}
          title={health.detail}
          pulse
        />
      );
    case "UNAUTHORIZED":
      return (
        <Pill
          tone="danger"
          label={compact ? "Unauthorized" : <>GHARIBO-V1 · unauthorized<Host host={host} /></>}
          title={health.detail}
        />
      );
    case "ERROR":
      return (
        <Pill
          tone="danger"
          label={compact ? "Error" : <>GHARIBO-V1 · error<Host host={host} /></>}
          title={health.detail}
        />
      );
    case "OFFLINE":
      return (
        <Pill
          tone="danger"
          label={compact ? "Offline" : <>GHARIBO-V1 · offline<Host host={host} /></>}
          title={health.detail}
        />
      );
    default:
      return (
        <Pill
          tone="warning"
          label={compact ? "Unavailable" : <>GHARIBO-V1 · unavailable<Host host={host} /></>}
          title={health.detail}
        />
      );
  }
}
