"use client";

import { TaskRunner } from "@/components/research-gym/task-runner";

export default function ResearchGymPage() {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Research Gym</h1>
        <p className="text-sm text-muted-foreground">
          Structured-knowledge-building tasks for training GHARIBO.
        </p>
      </div>
      <TaskRunner />
    </div>
  );
}
