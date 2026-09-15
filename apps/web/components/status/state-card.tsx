"use client";

import { cn } from "@/lib/utils";

interface StateCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  /** Short line under the title explaining what this card proves. */
  description?: string;
  /** Optional icon rendered before the title. */
  icon?: React.ReactNode;
}

/**
 * A titled section container for read-model truth. Used across the dashboard
 * and section pages so every panel shares the same header rhythm.
 */
export function StateCard({
  title,
  children,
  className,
  actions,
  description,
  icon,
}: StateCardProps) {
  return (
    <section className={cn("rounded-lg border bg-card", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          {icon && (
            <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
