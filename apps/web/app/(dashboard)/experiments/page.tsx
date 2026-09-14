"use client";

import { ExperimentList } from "@/components/experiments/experiment-list";

export default function ExperimentsPage() {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Experiments</h1>
        <p className="text-sm text-muted-foreground">
          Reproducible experiment lineage. Every run records full configuration.
        </p>
      </div>
      <ExperimentList />
    </div>
  );
}
