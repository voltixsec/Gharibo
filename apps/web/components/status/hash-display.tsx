"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface HashDisplayProps {
  /** The full identifier. Rendered in full on hover and copyable in full. */
  value: string | null | undefined;
  /** Number of leading characters to show before the ellipsis. */
  head?: number;
  /** Number of trailing characters to show after the ellipsis. */
  tail?: number;
  label?: string;
  className?: string;
  /** Use a monospace face (correct for hashes and IDs). */
  mono?: boolean;
}

/**
 * Renders long, copy-sensitive identifiers (hashes, run IDs, package IDs) in a
 * layout-safe way: truncated for display, full value on hover, one-click copy.
 *
 * This exists because raw 64-character hashes otherwise destroy table and card
 * layouts at narrow widths.
 */
export function HashDisplay({
  value,
  head = 10,
  tail = 6,
  label,
  className,
  mono = true,
}: HashDisplayProps) {
  const [copied, setCopied] = useState(false);

  if (!value) {
    return <span className={cn("text-sm text-muted-foreground", className)}>—</span>;
  }

  const shouldTruncate = value.length > head + tail + 3;
  const display = shouldTruncate
    ? `${value.slice(0, head)}…${value.slice(-tail)}`
    : value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be unavailable (insecure context); the title attribute
      // still exposes the full value.
    }
  };

  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1",
        className,
      )}
    >
      {label && (
        <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      )}
      <span
        className={cn(
          "truncate text-sm text-foreground",
          mono && "font-mono text-xs",
        )}
        title={value}
      >
        {display}
      </span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title={copied ? "Copied" : `Copy full value`}
        aria-label="Copy full value"
      >
        {copied ? (
          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Copy className="h-3 w-3" />
        )}
      </button>
    </span>
  );
}
