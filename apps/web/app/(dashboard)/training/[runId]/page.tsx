import { RunDetail } from "@/components/training/run-detail";

export default function TrainingRunDetailPage({
  params,
}: {
  params: { runId: string };
}) {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Training Run</h1>
        <p className="text-sm text-muted-foreground">
          Linked Training Package, free-tier resilience state, and results import.
        </p>
      </div>
      <RunDetail runId={params.runId} />
    </div>
  );
}
