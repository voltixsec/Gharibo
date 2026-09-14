"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitBranch, Plus } from "lucide-react";
import type { Experiment } from "@gharibo/shared";
import { formatDate, truncate } from "@/lib/utils";

export function ExperimentList() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/experiments");
      const json = await res.json();
      if (json.code === 0) {
        setExperiments(json.data);
      }
    } catch {
      // ignore
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
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : experiments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12">
            <GitBranch className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No experiments yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {experiments.map((exp) => (
              <div
                key={exp.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-3">
                  <GitBranch className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {truncate(exp.codeVersion || exp.id, 40)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Seed: {exp.seed ?? "—"} · {formatDate(exp.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
