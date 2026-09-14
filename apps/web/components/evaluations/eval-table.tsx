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
  const [modelFilter, setModelFilter] = useState("");

  const fetchEvals = useCallback(async () => {
    setLoading(true);
    try {
      const params = modelFilter ? `?modelId=${modelFilter}` : "";
      const res = await fetch(`/api/evaluations${params}`);
      const json = await res.json();
      if (json.code === 0) {
        setEvals(json.data);
      }
    } catch {
      // ignore
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
      <CardContent>
        <div className="mb-4 flex items-center gap-2">
          <input
            type="text"
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            placeholder="Filter by model ID..."
            className="h-9 flex-1 rounded-md border px-3 text-sm"
          />
          <Button size="sm" variant="outline" onClick={fetchEvals}>
            Refresh
          </Button>
        </div>

        <div className="rounded-md border">
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
                    Loading...
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
                      <TableCell colSpan={5} className="text-muted-foreground">
                        No results
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
                          <TableCell className="font-medium">{category}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {ev.modelId.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {ev.score !== null ? ev.score.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell>
                            {ev.baseModelScore !== null
                              ? ev.baseModelScore.toFixed(2)
                              : "—"}
                          </TableCell>
                          <TableCell>
                            {delta !== null ? (
                              <span
                                className={`flex items-center gap-1 text-sm ${
                                  delta > 0
                                    ? "text-green-500"
                                    : delta < 0
                                    ? "text-red-500"
                                    : ""
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

        <p className="mt-3 text-xs text-muted-foreground">
          Benchmark categories: {BENCHMARK_CATEGORIES.join(", ")}
        </p>
      </CardContent>
    </Card>
  );
}
