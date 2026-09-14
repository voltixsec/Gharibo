"use client";

import { RegistryTable } from "@/components/models/registry-table";

export default function ModelsPage() {
  return (
    <div className="container mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Model Registry</h1>
        <p className="text-sm text-muted-foreground">
          Single source of truth for model versions with status gates.
        </p>
      </div>
      <RegistryTable />
    </div>
  );
}
