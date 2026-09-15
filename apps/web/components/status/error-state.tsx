"use client";

import { cn } from "@/lib/utils";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ title, message, onRetry, className }: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-md border border-red-500/20 bg-red-500/5 px-4 py-8 text-center",
        className,
      )}
    >
      <AlertCircle className="mb-2 h-6 w-6 text-red-500" />
      <p className="text-sm font-medium text-red-700 dark:text-red-400">{title}</p>
      {message && (
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      )}
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={onRetry}
        >
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
