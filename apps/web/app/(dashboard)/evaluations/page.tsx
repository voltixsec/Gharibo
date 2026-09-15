"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { EvalTable } from "@/components/evaluations/eval-table";

export default function EvaluationsPage() {
  return (
    <>
      <PageHeader
        title="Evaluations"
        description="Benchmark a candidate against the base model. No score exists until a real evaluation runs."
      />
      <PageContent width="wide">
        <EvalTable />
      </PageContent>
    </>
  );
}
