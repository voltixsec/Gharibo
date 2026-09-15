"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { DatasetList } from "@/components/datasets/dataset-list";

export default function DatasetsPage() {
  return (
    <>
      <PageHeader
        title="Datasets"
        description="Assemble approved records into versioned, frozen datasets for training."
      />
      <PageContent width="default">
        <DatasetList />
      </PageContent>
    </>
  );
}
