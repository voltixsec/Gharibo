"use client";

import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  /**
   * The metric value. Numbers render in tabular figures. `null`/`undefined`
   * renders an em dash — never a fabricated zero, because "unknown" and "0"
   * are different truths. A React node may be passed for things like a
   * copyable hash display.
   */
  value: React.ReactNode;
  sublabel?: string;
  className?: string;
  /** Render the value in monospace — correct for IDs and hashes. */
  mono?: boolean;
  /** Semantic tone for the value text. */
  tone?: "default" | "muted" | "warning" | "success" | "danger";
}

const TONE_CLASSES: Record<NonNullable<MetricCardProps["tone"]>, string> = {
  default: "text-foreground",
  muted: "text-muted-foreground",
  warning: "text-amber-700 dark:text-amber-400",
  success: "text-emerald-700 dark:text-emerald-400",
  danger: "text-red-700 dark:text-red-400",
};

export function MetricCard({
  label,
  value,
  sublabel,
  className,
  mono,
  tone = "default",
}: MetricCardProps) {
  const isEmpty = value === null || value === undefined || value === "";
  // Only primitive values are safe to stringify into a title attribute.
  const titleValue =
    typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  return (
    <div className={cn("min-w-0 rounded-md border bg-muted/30 px-3 py-2.5", className)}>
      <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
      <div
        className={cn(
          "mt-0.5 min-w-0 truncate text-lg font-semibold tabular-nums",
          mono && "font-mono text-sm",
          isEmpty ? "text-muted-foreground" : TONE_CLASSES[tone],
        )}
        title={titleValue}
      >
        {isEmpty ? "—" : value}
      </div>
      {sublabel && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={sublabel}>
          {sublabel}
        </p>
      )}
    </div>
  );
}
