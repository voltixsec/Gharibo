"use client";

import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /** Optional compact status strip rendered under the description. */
  meta?: React.ReactNode;
}

/**
 * The shared page header. Every dashboard page renders exactly one of these so
 * the title block, divider and action alignment are identical everywhere.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
  meta,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b bg-background px-4 py-4 sm:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
    </div>
  );
}
