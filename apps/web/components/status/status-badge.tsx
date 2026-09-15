"use client";

import { cn } from "@/lib/utils";

/**
 * The single shared semantic status vocabulary for GHARIBO AI Lab.
 *
 * Every status surface in the product maps onto one of these variants so that
 * a colour always means the same thing:
 *
 *   success / healthy     green   — the thing is proven good
 *   running               cyan    — work is actively executing
 *   queued                blue    — work is accepted and waiting
 *   authorized            violet  — a decision permits action; NOT execution
 *   pending               amber   — waiting on a human or an external step
 *   warning               amber   — attention needed, not yet broken
 *   failed / error        red     — the thing is broken
 *   not-started / not-run grey    — the thing has not happened
 *   neutral               grey    — inert or unknown
 *
 * Nothing that is merely authorized or queued may use green.
 */
export type StatusVariant =
  | "healthy"
  | "success"
  | "running"
  | "queued"
  | "authorized"
  | "pending"
  | "warning"
  | "failed"
  | "error"
  | "not-started"
  | "not-run"
  | "neutral";

interface VariantStyle {
  /** Badge container classes. */
  badge: string;
  /** Inner dot classes. */
  dot: string;
  /** Plain text tone, for inline status text. */
  text: string;
}

const VARIANT_STYLES: Record<StatusVariant, VariantStyle> = {
  healthy: {
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  success: {
    badge:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  running: {
    badge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    dot: "bg-cyan-500",
    text: "text-cyan-700 dark:text-cyan-400",
  },
  queued: {
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
    text: "text-blue-700 dark:text-blue-400",
  },
  authorized: {
    badge:
      "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
    dot: "bg-violet-500",
    text: "text-violet-700 dark:text-violet-400",
  },
  pending: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  warning: {
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  failed: {
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  error: {
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  "not-started": {
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
  "not-run": {
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
  neutral: {
    badge: "border-border bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
};

/** Plain text tone for a variant, for inline non-badge status text. */
export function statusTextClass(variant: StatusVariant): string {
  return VARIANT_STYLES[variant].text;
}

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
  className?: string;
  /** Optional secondary detail surfaced on hover. */
  detail?: string;
  /**
   * Override the pulse default. Only genuinely live states pulse by default;
   * authorization and queued states never do.
   */
  pulse?: boolean;
}

export function StatusBadge({
  variant,
  label,
  className,
  detail,
  pulse,
}: StatusBadgeProps) {
  const style = VARIANT_STYLES[variant];
  // Only live execution may pulse. Authorization must never look "alive".
  const shouldPulse = pulse ?? variant === "running";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        style.badge,
        className,
      )}
      title={detail ? `${label} — ${detail}` : label}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          style.dot,
          shouldPulse && "animate-pulse",
        )}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
