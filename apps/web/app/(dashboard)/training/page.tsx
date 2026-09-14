"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RunForm } from "@/components/training/run-form";
import { RunList } from "@/components/training/run-list";
import { PreflightPanel } from "@/components/training/preflight-panel";
import type { PreflightResult } from "@gharibo/shared";
import { PlayCircle } from "lucide-react";

export default function TrainingPage() {
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const runPreflight = async () => {
    setPreflightLoading(true);
    try {
      const res = await fetch("/api/preflight");
      const json = await res.json();
      if (json.code === 0) {
        setPreflightResult(json.data);
      }
    } catch {
      // ignore
    } finally {
      setPreflightLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Training Center</h1>
        <p className="text-sm text-muted-foreground">
          Configure LoRA/QLoRA/SFT runs and verify environment readiness.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <Button onClick={runPreflight} disabled={preflightLoading}>
            <PlayCircle className="mr-2 h-4 w-4" />
            Run Pre-flight Check
          </Button>
        </div>

        <PreflightPanel
          result={preflightResult}
          loading={preflightLoading}
          onRefresh={runPreflight}
        />

        <RunForm onSaved={() => setRefreshKey((k) => k + 1)} />

        <RunList key={refreshKey} />
      </div>
    </div>
  );
}
