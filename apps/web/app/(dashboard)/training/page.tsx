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
import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import {
  StateCard,
  MetricCard,
  StatusBadge,
  TruthNotice,
  ErrorState,
} from "@/components/status";
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
import { PlayCircle, RefreshCw } from "lucide-react";
import {
  useGovernanceState,
  lifecycleVariantClient,
} from "@/hooks/use-governance-state";

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /*
   * Governed truth is read from the master state via the API boundary, not
   * inferred from the local SQLite run records. The UI must never claim a
   * training lifecycle phase the governance layer has not recorded.
   */
  const { state: governed } = useGovernanceState();
  const lifecycle = governed?.lifecycle ?? {
    lifecycle: "UNKNOWN" as const,
    rawStatus: null,
    hasStarted: false,
    invariantHolds: false,
    invariant: null,
    reason: "Loading governance state…",
  };
  const engine = governed?.engine ?? {
    id: null,
    name: null,
    freezeLabel: null,
    freezeApplied: false,
    qualificationStatus: null,
    ctoAccepted: false,
    method: null,
    quantization: null,
    computePolicy: null,
    weightsDownloaded: false,
    adaptersProduced: null,
    checkpointsProduced: null,
    evaluationResults: null,
  };
  const experiment = governed?.experiment;
  const lifecycleVariant = lifecycleVariantClient;

  const loadData = useCallback(async () => {
    setLoading(true);
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
      } else {
        setLoadError(runJson.message ?? "Failed to load training runs");
      }
      if (dsJson.code !== 0) {
        setLoadError(dsJson.message ?? "Failed to load datasets");
      } else {
        setLoadError(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load training data");
    } finally {
      setLoading(false);
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
      // The PreflightPanel renders the unavailable state on its own.
    } finally {
      setPreflightLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Training"
        description="Configure runs, verify readiness, and export a reproducible Kaggle training package."
        meta={
          <>
            <StatusBadge
              variant={lifecycleVariant(lifecycle.lifecycle)}
              label={lifecycle.lifecycle}
              detail={lifecycle.reason}
            />
            <StatusBadge
              variant={
                engine.qualificationStatus === "QUALIFIED" ? "success" : "warning"
              }
              label={`Env ${engine.qualificationStatus ?? "UNKNOWN"}`}
            />
            {engine.freezeLabel && (
              <Badgeish label={`Freeze ${engine.freezeLabel}`} />
            )}
          </>
        }
      />

      <PageContent width="wide">
        {/* Governed truth — read-only, never mutated from the UI */}
        <StateCard
          title="Governed Training State"
          description="Read from governance/GHARIBO_MASTER_STATE.json. This page never changes training state."
          actions={
            <StatusBadge
              variant={lifecycleVariant(lifecycle.lifecycle)}
              label={lifecycle.lifecycle}
            />
          }
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Engine"
              value={engine.name}
              sublabel={engine.freezeApplied ? "Freeze applied" : "Freeze not applied"}
            />
            <MetricCard label="Method" value={engine.method} />
            <MetricCard label="Quantization" value={engine.quantization} />
            <MetricCard label="Compute Policy" value={engine.computePolicy} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              label="Checkpoints Produced"
              value={engine.checkpointsProduced}
            />
            <MetricCard label="Adapters Produced" value={engine.adaptersProduced} />
            <MetricCard
              label="Evaluation Results"
              value={engine.evaluationResults}
            />
            <MetricCard
              label="Weights Downloaded"
              value={engine.weightsDownloaded ? "yes" : "no"}
            />
          </div>

          <div className="mt-3">
            <TruthNotice
              variant={lifecycle.invariantHolds ? "info" : "alert"}
              title={lifecycle.invariant ?? "Training invariant unavailable"}
              message={lifecycle.reason}
            />
          </div>

          <div className="mt-3 rounded-md border p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Lifecycle Vocabulary
            </p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "DRAFT",
                  "QUEUED",
                  "AUTHORIZED",
                  "RUNNING",
                  "COMPLETED",
                  "FAILED",
                  "INTERRUPTED",
                  "RESUMABLE",
                ] as const
              ).map((phase) => (
                <StatusBadge
                  key={phase}
                  variant={
                    phase === "AUTHORIZED"
                      ? "authorized"
                      : phase === "QUEUED"
                        ? "queued"
                        : phase === "RUNNING"
                          ? "running"
                          : phase === "COMPLETED"
                            ? "success"
                            : phase === "FAILED"
                              ? "failed"
                              : phase === "INTERRUPTED" || phase === "RESUMABLE"
                                ? "warning"
                                : "not-started"
                  }
                  label={phase}
                  // Only the actual phase pulses.
                  pulse={lifecycle.lifecycle === phase && phase === "RUNNING"}
                  className={
                    lifecycle.lifecycle === phase
                      ? "ring-1 ring-current ring-offset-1"
                      : "opacity-45"
                  }
                  detail={
                    lifecycle.lifecycle === phase
                      ? "Current governed phase"
                      : "Not the current phase"
                  }
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              AUTHORIZED means a decision permits action. It is never shown as
              RUNNING, because no execution evidence exists.
            </p>
          </div>
        </StateCard>

        {/* Governance boundary notice */}
        <TruthNotice
          variant="info"
          title="This page does not launch training"
          message="Kaggle launch, run-state transitions and governance reconciliation are owned by a separate governed process. The controls here configure and export a package; they never change training state."
        />

        {/* Package configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Zero-Cost Training Package (Kaggle)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <Label>Training Run</Label>
                <Select value={selectedRunId} onValueChange={setSelectedRunId}>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={runs.length === 0 ? "No runs yet" : "Select a run"}
                    />
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
              <Label>Dataset Version</Label>
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

        {/* Environment readiness */}
        <StateCard
          title="Environment Pre-flight"
          description="Verifies the local environment before a package is exported."
          actions={
            <Button onClick={runPreflight} disabled={preflightLoading} size="sm">
              {preflightLoading ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              {preflightLoading ? "Checking…" : "Run Pre-flight Check"}
            </Button>
          }
        >
          <PreflightPanel
            result={preflightResult}
            loading={preflightLoading}
            onRefresh={runPreflight}
          />
        </StateCard>

        {/* Run configuration + history */}
        <RunForm
          onSaved={() => {
            setRefreshKey((k) => k + 1);
          }}
        />

        {loadError ? (
          <ErrorState
            title="Could not load training runs"
            message={loadError}
            onRetry={() => setRefreshKey((k) => k + 1)}
          />
        ) : loading ? (
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        ) : (
          <RunList key={refreshKey} />
        )}

        {/* Experiment linkage */}
        {experiment?.experimentId && (
          <StateCard
            title="Experiment Linkage"
            description="How this run relates to the registered experiment."
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard label="Experiment" value={experiment.experimentId} />
              <MetricCard label="Base Model" value={experiment.baseModel} mono />
              <MetricCard
                label="Dataset Version"
                value={experiment.datasetVersion}
              />
              <MetricCard
                label="Evaluation"
                value={experiment.evaluationState ?? "—"}
              />
            </div>
            {experiment.promotionBlockedReason && (
              <div className="mt-3">
                <TruthNotice
                  variant="warning"
                  title="Promotion blocked"
                  message={experiment.promotionBlockedReason}
                />
              </div>
            )}
          </StateCard>
        )}
      </PageContent>
    </>
  );
}

/** Small inline metadata chip. */
function Badgeish({ label }: { label: string }) {
  return (
    <span className="rounded border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}
