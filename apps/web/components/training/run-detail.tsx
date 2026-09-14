"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfigInspector } from "./config-inspector";
import { ResiliencePanel } from "./resilience-panel";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { Loader2, Upload } from "lucide-react";
import type { TrainingPackage, TrainingRun } from "@gharibo/shared";

interface RunDetailProps {
  runId: string;
}

interface PackageSummary {
  id: string;
  experimentId: string;
  datasetVersionId: string | null;
  runId: string | null;
  workerId: string;
  createdAt: string;
}

/**
 * Run + package detail. Shows the run configuration, the linked immutable package,
 * the resilience state, and an import-results form (P1-01/P1-02).
 */
export function RunDetail({ runId }: RunDetailProps) {
  const { toast } = useToast();
  const [run, setRun] = useState<TrainingRun | null>(null);
  const [packages, setPackages] = useState<PackageSummary[]>([]);
  const [pkg, setPkg] = useState<TrainingPackage | null>(null);
  const [loading, setLoading] = useState(true);

  // Import form state
  const [manifest, setManifest] = useState("");
  const [metrics, setMetrics] = useState("{}");
  const [artifacts, setArtifacts] = useState("[]");
  const [rollupHash, setRollupHash] = useState("");
  const [outcome, setOutcome] = useState<"COMPLETED" | "FAILED" | "INTERRUPTED">("COMPLETED");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/training-runs/${runId}`);
      const json = await res.json();
      if (json.code === 0) setRun(json.data as TrainingRun);

      const res2 = await fetch("/api/training-packages");
      const json2 = await res2.json();
      if (json2.code === 0) {
        const mine = (json2.data as PackageSummary[]).filter((p) => p.runId === runId);
        setPackages(mine);
        if (mine.length > 0) {
          const res3 = await fetch(`/api/training-packages/${mine[0].id}`);
          const json3 = await res3.json();
          if (json3.code === 0) setPkg(json3.data.package as TrainingPackage);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    load();
  }, [load]);

  const doImport = async () => {
    setImporting(true);
    try {
      let parsedMetrics: Record<string, unknown> = {};
      let parsedArtifacts: unknown[] = [];
      try {
        parsedMetrics = JSON.parse(metrics) as Record<string, unknown>;
      } catch {
        throw new Error("metrics is not valid JSON");
      }
      try {
        parsedArtifacts = JSON.parse(artifacts) as unknown[];
      } catch {
        throw new Error("artifacts is not valid JSON");
      }

      const body: Record<string, unknown> = {
        manifest,
        metrics: parsedMetrics,
        outcome,
      };
      if (Array.isArray(parsedArtifacts) && parsedArtifacts.length > 0) {
        body.artifacts = parsedArtifacts;
        body.rollupHash = rollupHash;
      }

      const res = await fetch(`/api/training-runs/${runId}/import-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: "Results imported", variant: "success" });
        load();
      } else {
        toast({ title: "Import failed", description: json.message, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading run…
      </div>
    );
  }

  if (!run) {
    return <p className="py-12 text-sm text-muted-foreground">Training run not found.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{run.baseModel}</CardTitle>
          <Badge variant="outline" className="text-xs">
            {run.method}
          </Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">
            run_id <span className="font-mono">{run.runId}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Created {formatDate(run.createdAt)} · {run.epochs ?? "—"} epochs · LR{" "}
            {run.learningRate ?? "—"} · seq {run.maxSeqLength ?? "—"} · {run.dtype ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            LoRA r {run.loraRank ?? "—"} / alpha {run.loraAlpha ?? "—"} ·{" "}
            {(run.targetModules ?? []).join(", ") || "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            package_id{" "}
            <span className="font-mono">{run.packageId ? run.packageId.slice(0, 20) + "…" : "—"}</span>
          </p>
        </CardContent>
      </Card>

      <ResiliencePanel run={run} onChanged={load} />

      {pkg ? (
        <ConfigInspector pkg={pkg} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Linked package</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No Training Package is linked to this run yet. Generate one from the Training page.
            </p>
            {packages.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {packages.length} package(s) recorded for this run.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Import results</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manifest">Experiment manifest (JSON, from the notebook)</Label>
            <Textarea
              id="manifest"
              value={manifest}
              onChange={(e) => setManifest(e.target.value)}
              placeholder="Paste the manifest.json produced by the notebook"
              rows={5}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="metrics">Metrics (JSON)</Label>
            <Textarea
              id="metrics"
              value={metrics}
              onChange={(e) => setMetrics(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Outcome (explicit)</Label>
              <Select value={outcome} onValueChange={(v) => setOutcome(v as typeof outcome)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="COMPLETED">COMPLETED</SelectItem>
                  <SelectItem value="FAILED">FAILED</SelectItem>
                  <SelectItem value="INTERRUPTED">INTERRUPTED</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rollup">Artifact rollup hash (required with artifacts)</Label>
              <Input
                id="rollup"
                value={rollupHash}
                onChange={(e) => setRollupHash(e.target.value)}
                placeholder="sha256 (from CHECKSUMS.sha256)"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="artifacts">Artifacts (JSON array, optional)</Label>
            <Textarea
              id="artifacts"
              value={artifacts}
              onChange={(e) => setArtifacts(e.target.value)}
              rows={3}
            />
          </div>
          <Button onClick={doImport} disabled={importing || !manifest}>
            {importing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Import results
          </Button>
          <p className="text-xs text-muted-foreground">
            Only real values produced by a run are stored. Artifact hashes are re-verified against the
            manifest-of-hashes; a mismatch is a hard failure.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
