"use client";

import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

/**
 * The shared empty state. Use it whenever a surface has genuinely nothing to
 * show, rather than filling the space with placeholder content.
 */
export function EmptyState({
  title,
  message,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-8 text-center",
        className,
      )}
    >
      {icon && <div className="mb-2 text-muted-foreground">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {message && (
        <p className="mt-1 max-w-md text-xs text-muted-foreground/80">{message}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
