"use client";

import { EvalTable } from "@/components/evaluations/eval-table";

export default function EvaluationsPage() {
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Evaluations</h1>
        <p className="text-sm text-muted-foreground">
          Benchmark models against 11 categories. Compare base vs. candidate.
        </p>
      </div>
      <EvalTable />
    </div>
  );
}
