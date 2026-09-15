"use client";

import { cn } from "@/lib/utils";

type Width = "narrow" | "default" | "wide" | "full";

const WIDTH_CLASSES: Record<Width, string> = {
  // Forms and settings: keep line length comfortable.
  narrow: "max-w-3xl",
  // Prose-ish pages and dashboards.
  default: "max-w-5xl",
  // Table-heavy operational pages.
  wide: "max-w-7xl",
  // Data Factory and other full-bleed tables.
  full: "max-w-none",
};

interface PageContentProps {
  children: React.ReactNode;
  width?: Width;
  className?: string;
  /** Remove the default vertical rhythm, for pages that manage their own. */
  bare?: boolean;
}

/**
 * The shared page content container.
 *
 * Centralising width and padding here is what stops ten pages from each
 * inventing their own margins and reading as ten unrelated prototypes.
 * `min-w-0` guards against long hashes and IDs forcing horizontal overflow.
 */
export function PageContent({
  children,
  width = "default",
  className,
  bare,
}: PageContentProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 px-4 py-5 sm:px-6",
        WIDTH_CLASSES[width],
        !bare && "space-y-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
