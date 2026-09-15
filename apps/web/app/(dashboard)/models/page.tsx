"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { RegistryTable } from "@/components/models/registry-table";

export default function ModelsPage() {
  return (
    <>
      <PageHeader
        title="Model Registry"
        description="Single source of truth for model versions, with status gates between experiment and promotion."
      />
      <PageContent width="wide">
        <RegistryTable />
      </PageContent>
    </>
  );
}
