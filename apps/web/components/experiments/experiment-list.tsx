"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GitBranch } from "lucide-react";
import type { Experiment } from "@gharibo/shared";
import { formatDate, truncate } from "@/lib/utils";
import { EmptyState, ErrorState, TruthNotice } from "@/components/status";

export function ExperimentList() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/experiments");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setExperiments(json.data);
    } catch (err) {
      setExperiments([]);
      setError(err instanceof Error ? err.message : "Failed to load experiments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExperiments();
  }, [fetchExperiments]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Experiments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TruthNotice
          variant="info"
          title="Recorded experiments only"
          message="Outcome, score and promotion state are shown as recorded. An experiment with no completed evaluation is not described as successful."
        />

        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading experiments…</p>
        ) : error ? (
          <ErrorState title="Could not load experiments" message={error} />
        ) : experiments.length === 0 ? (
          <EmptyState
            icon={<GitBranch className="h-8 w-8" />}
            title="No experiments recorded yet"
            message="Experiments link a training run to its configuration, artifacts and evaluation."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {experiments.map((exp) => (
              <div
                key={exp.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium" title={exp.codeVersion || exp.id}>
                      {truncate(exp.codeVersion || exp.id, 40)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seed: {exp.seed ?? "—"} · {formatDate(exp.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {exp.trainingRunId && (
                    <Badge variant="outline" className="text-xs">
                      Linked Run
                    </Badge>
                  )}
                  {exp.modelId && (
                    <Badge variant="secondary" className="text-xs">
                      Model
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
