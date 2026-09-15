"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { RecordTable } from "@/components/data-factory/record-table";

export default function DataFactoryPage() {
  return (
    <>
      <PageHeader
        title="Data Factory"
        description="Ingest, validate, tag and approve records, with JSONL import and export."
      />
      <PageContent width="full">
        <RecordTable />
      </PageContent>
    </>
  );
}
