"use client";

import { DatasetList } from "@/components/datasets/dataset-list";

export default function DatasetsPage() {
  return (
    <div className="container mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Datasets</h1>
        <p className="text-sm text-muted-foreground">
          Assemble approved records into versioned, frozen datasets for training.
        </p>
      </div>
      <DatasetList />
    </div>
  );
}
