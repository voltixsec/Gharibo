"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, truncate } from "@/lib/utils";
import type { TrainingRun } from "@gharibo/shared";
import { ErrorState, StatusBadge, EmptyState } from "@/components/status";
import type { StatusVariant } from "@/components/status";
import { ListChecks } from "lucide-react";

/**
 * Run statuses map onto the shared lifecycle vocabulary. RUNNING is cyan
 * (live work), QUEUED is blue (accepted, waiting), INTERRUPTED/RESUMABLE are
 * amber (attention), and only COMPLETED is green.
 */
const STATUS_VARIANT: Record<string, StatusVariant> = {
  DRAFT: "not-started",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "success",
  FAILED: "failed",
  CANCELLED: "neutral",
  INTERRUPTED: "warning",
  RESUMABLE: "warning",
};

export function RunList() {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/training-runs");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setRuns(json.data);
    } catch (err) {
      setRuns([]);
      setError(err instanceof Error ? err.message : "Failed to load training runs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Training Run History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading runs…</p>
        ) : error ? (
          <ErrorState title="Could not load training runs" message={error} />
        ) : runs.length === 0 ? (
          <EmptyState
            icon={<ListChecks className="h-8 w-8" />}
            title="No training runs recorded"
            message="A run appears here once its configuration has been saved. Loading records does not start or alter training."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <Link
                key={run.runId}
                href={`/training/${run.runId}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 transition-colors hover:bg-accent"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium" title={run.baseModel}>
                      {truncate(run.baseModel, 40)}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {run.method}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {run.epochs || "—"} epochs · LR {run.learningRate || "—"} ·{" "}
                    {formatDate(run.createdAt)}
                  </p>
                </div>
                <StatusBadge
                  variant={STATUS_VARIANT[run.status] || "neutral"}
                  label={run.status}
                  className="shrink-0"
                />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
