"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { TaskRunner } from "@/components/research-gym/task-runner";

export default function ResearchGymPage() {
  return (
    <>
      <PageHeader
        title="Research Gym"
        description="Structured-knowledge-building tasks whose outputs feed the training corpus."
      />
      <PageContent width="default">
        <TaskRunner />
      </PageContent>
    </>
  );
}
