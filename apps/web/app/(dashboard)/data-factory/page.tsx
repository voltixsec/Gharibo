"use client";

import { RecordTable } from "@/components/data-factory/record-table";

export default function DataFactoryPage() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Data Factory</h1>
        <p className="text-sm text-muted-foreground">
          Data pipeline with validation, bulk actions, and JSONL I/O.
        </p>
      </div>
      <RecordTable />
    </div>
  );
}
