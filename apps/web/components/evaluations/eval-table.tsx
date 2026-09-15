"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { EvaluationResult, BenchmarkCategory } from "@gharibo/shared";
import { ErrorState, TruthNotice, EmptyState } from "@/components/status";

const BENCHMARK_CATEGORIES: BenchmarkCategory[] = [
  "Reasoning",
  "Coding",
  "Instruction Following",
  "Structured Output",
  "Research",
  "Source Fidelity",
  "Hallucination Resistance",
  "Data Extraction",
  "Classification",
  "Deduplication",
  "Tool Use",
];

export function EvalTable() {
  const [evals, setEvals] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modelFilter, setModelFilter] = useState("");

  const fetchEvals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = modelFilter ? `?modelId=${modelFilter}` : "";
      const res = await fetch(`/api/evaluations${params}`);
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setEvals(json.data);
    } catch (err) {
      setEvals([]);
      setError(err instanceof Error ? err.message : "Failed to load evaluations");
    } finally {
      setLoading(false);
    }
  }, [modelFilter]);

  useEffect(() => {
    fetchEvals();
  }, [fetchEvals]);

  // Group by benchmark category
  const byCategory = BENCHMARK_CATEGORIES.map((cat) => ({
    category: cat,
    results: evals.filter((e) => e.benchmarkCategory === cat),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benchmark Results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TruthNotice
          variant="info"
          title="Scores come from recorded runs only"
          message="A category with no recorded benchmark run shows as not run. Scores are never estimated or filled in."
        />

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            placeholder="Filter by model ID…"
            aria-label="Filter evaluations by model ID"
            className="h-9 min-w-[12rem] flex-1 rounded-md border px-3 text-sm"
          />
          <Button size="sm" variant="outline" onClick={fetchEvals}>
            Refresh
          </Button>
        </div>

        {error ? (
          <ErrorState title="Could not load evaluations" message={error} />
        ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Benchmark</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Base Score</TableHead>
                <TableHead>Delta</TableHead>
                <TableHead>Regressions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : byCategory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No evaluation results yet
                  </TableCell>
                </TableRow>
              ) : (
                byCategory.map(({ category, results }) =>
                  results.length === 0 ? (
                    <TableRow key={category}>
                      <TableCell className="font-medium">{category}</TableCell>
                      <TableCell colSpan={5}>
                        <span className="text-muted-foreground">Not run</span>
                      </TableCell>
                    </TableRow>
                  ) : (
                    results.map((ev) => {
                      const delta =
                        ev.score !== null && ev.baseModelScore !== null
                          ? ev.score - ev.baseModelScore
                          : null;
                      return (
                        <TableRow key={ev.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {category}
                          </TableCell>
                          <TableCell
                            className="font-mono text-xs"
                            title={ev.modelId}
                          >
                            {ev.modelId.slice(0, 8)}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {ev.score !== null ? ev.score.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {ev.baseModelScore !== null
                              ? ev.baseModelScore.toFixed(2)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {delta !== null ? (
                              <span
                                className={`flex items-center gap-1 text-sm tabular-nums ${
                                  delta > 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : delta < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {delta > 0 && <TrendingUp className="h-3 w-3" />}
                                {delta < 0 && <TrendingDown className="h-3 w-3" />}
                                {delta === 0 && <Minus className="h-3 w-3" />}
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(2)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>
                            {ev.regressions.length > 0 ? (
                              <Badge variant="destructive" className="text-xs">
                                {ev.regressions.length} regressions
                              </Badge>
                            ) : (
                              <Badge variant="success" className="text-xs">
                                No regressions
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ),
                )
              )}
            </TableBody>
          </Table>
        </div>
        )}

        <p className="text-xs text-muted-foreground">
          Benchmark categories: {BENCHMARK_CATEGORIES.join(", ")}
        </p>
      </CardContent>
    </Card>
  );
}
