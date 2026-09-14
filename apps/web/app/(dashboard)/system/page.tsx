"use client";

import { SystemDashboard } from "@/components/system/system-dashboard";

export default function SystemPage() {
  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System</h1>
        <p className="text-sm text-muted-foreground">
          Provider status, storage usage, and environment info.
        </p>
      </div>
      <SystemDashboard />
    </div>
  );
}
