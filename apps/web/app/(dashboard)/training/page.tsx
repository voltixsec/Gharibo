"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RunForm } from "@/components/training/run-form";
import { RunList } from "@/components/training/run-list";
import { PreflightPanel } from "@/components/training/preflight-panel";
import { DatasetVersionSelector } from "@/components/training/dataset-version-selector";
import { ConfigInspector } from "@/components/training/config-inspector";
import { PackageExportPanel } from "@/components/training/package-export-panel";
import type {
  Dataset,
  PreflightResult,
  TrainingPackage,
  TrainingRun,
} from "@gharibo/shared";
import { PlayCircle } from "lucide-react";

const DEFAULT_EXPERIMENT_ID = "GHARIBO-exp-001";

export default function TrainingPage() {
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // M2 flow state
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [experimentId, setExperimentId] = useState(DEFAULT_EXPERIMENT_ID);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [generatedPkg, setGeneratedPkg] = useState<TrainingPackage | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [dsRes, runRes] = await Promise.all([
        fetch("/api/datasets"),
        fetch("/api/training-runs"),
      ]);
      const dsJson = await dsRes.json();
      if (dsJson.code === 0) setDatasets(dsJson.data as Dataset[]);
      const runJson = await runRes.json();
      if (runJson.code === 0) {
        const list = runJson.data as TrainingRun[];
        setRuns(list);
        setSelectedRunId((cur) => cur || list[0]?.runId || "");
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshKey]);

  const runPreflight = async () => {
    setPreflightLoading(true);
    try {
      const qs = selectedDatasetId
        ? `?datasetId=${encodeURIComponent(selectedDatasetId)}`
        : "";
      const res = await fetch(`/api/preflight${qs}`);
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
          Configure runs, verify readiness, and export a reproducible Kaggle Training Package.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* ---- M2: Training Package flow ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Zero-Cost Training Package (Kaggle)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="experiment-id">Experiment ID</Label>
                <Input
                  id="experiment-id"
                  value={experimentId}
                  onChange={(e) => setExperimentId(e.target.value)}
                  placeholder="GHARIBO-exp-001"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Training run</Label>
                <Select value={selectedRunId} onValueChange={setSelectedRunId}>
                  <SelectTrigger>
                    <SelectValue placeholder={runs.length === 0 ? "No runs yet" : "Select a run"} />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No runs yet
                      </SelectItem>
                    ) : (
                      runs.map((r) => (
                        <SelectItem key={r.runId} value={r.runId}>
                          {r.baseModel} · {r.method} · {r.status}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Dataset version</Label>
              <DatasetVersionSelector
                datasets={datasets}
                value={selectedDatasetId}
                onChange={setSelectedDatasetId}
              />
            </div>
          </CardContent>
        </Card>

        <ConfigInspector pkg={generatedPkg} />

        <PackageExportPanel
          experimentId={experimentId}
          runId={selectedRunId}
          datasetId={selectedDatasetId}
          onGenerated={setGeneratedPkg}
        />

        {/* ---- M1: environment readiness ---- */}
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

        {/* ---- M1: run configuration + history ---- */}
        <RunForm
          onSaved={() => {
            setRefreshKey((k) => k + 1);
          }}
        />

        <RunList key={refreshKey} />
      </div>
    </div>
  );
}
