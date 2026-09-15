import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { RunDetail } from "@/components/training/run-detail";

export default function TrainingRunDetailPage({
  params,
}: {
  params: { runId: string };
}) {
  return (
    <>
      <PageHeader
        title="Training Run"
        description="Linked training package, free-tier resilience state, and results import."
      />
      <PageContent width="wide">
        <RunDetail runId={params.runId} />
      </PageContent>
    </>
  );
}
