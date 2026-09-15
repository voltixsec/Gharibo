"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { ExperimentList } from "@/components/experiments/experiment-list";

export default function ExperimentsPage() {
  return (
    <>
      <PageHeader
        title="Experiments"
        description="Reproducible experiment lineage. Every run records its full governed configuration."
      />
      <PageContent width="wide">
        <ExperimentList />
      </PageContent>
    </>
  );
}
