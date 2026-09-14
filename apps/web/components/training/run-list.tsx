"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, truncate } from "@/lib/utils";
import type { TrainingRun, RunStatus } from "@gharibo/shared";

const STATUS_BADGE: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  DRAFT: "secondary",
  QUEUED: "default",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
};

export function RunList() {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/training-runs");
      const json = await res.json();
      if (json.code === 0) {
        setRuns(json.data);
      }
    } catch {
      // ignore
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
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No training runs yet. Configure and save one above.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {runs.map((run) => (
              <div
                key={run.runId}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {truncate(run.baseModel, 40)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {run.method}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {run.epochs || "—"} epochs · LR {run.learningRate || "—"} ·{" "}
                    {formatDate(run.createdAt)}
                  </p>
                </div>
                <Badge
                  variant={STATUS_BADGE[run.status] || "outline"}
                  className="text-xs"
                >
                  {run.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
