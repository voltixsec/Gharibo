"use client";

import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { SystemDashboard } from "@/components/system/system-dashboard";

export default function SystemPage() {
  return (
    <>
      <PageHeader
        title="System"
        description="Operational diagnostics: provider reachability, storage and environment facts."
      />
      <PageContent width="wide">
        <SystemDashboard />
      </PageContent>
    </>
  );
}
