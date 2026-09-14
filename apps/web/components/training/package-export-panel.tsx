"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Download, Loader2, Package, TriangleAlert } from "lucide-react";
import type { TrainingPackage, WorkerInstructions } from "@gharibo/shared";

interface PackageExportPanelProps {
  experimentId: string;
  runId: string;
  datasetId: string;
  onGenerated: (pkg: TrainingPackage) => void;
}

/**
 * Generates / exports the Kaggle-ready Training Package and shows the exact
 * operator instructions. Export fails loudly (the API returns 400 with the reason).
 */
export function PackageExportPanel({
  experimentId,
  runId,
  datasetId,
  onGenerated,
}: PackageExportPanelProps) {
  const { toast } = useToast();
  const [pkg, setPkg] = useState<TrainingPackage | null>(null);
  const [instructions, setInstructions] = useState<WorkerInstructions | null>(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = Boolean(experimentId && runId && datasetId);

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/training-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experimentId, runId, datasetId }),
      });
      const json = await res.json();
      if (json.code !== 0) {
        setError(json.message);
        toast({ title: "Export failed", description: json.message, variant: "destructive" });
        return;
      }
      const generated = json.data as TrainingPackage;
      setPkg(generated);
      onGenerated(generated);

      const res2 = await fetch(`/api/training-packages/${generated.packageId}`);
      const json2 = await res2.json();
      if (json2.code === 0) setInstructions(json2.data.instructions as WorkerInstructions);

      toast({
        title: "Training Package generated",
        description: `package_id ${generated.packageId.slice(0, 12)}…`,
        variant: "success",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setError(msg);
      toast({ title: "Export failed", description: msg, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!pkg) return;
    setDownloading(true);
    try {
      const res = await fetch(`/api/training-packages/${pkg.packageId}/export`);
      if (!res.ok) {
        const text = await res.text();
        toast({ title: "Download failed", description: text, variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pkg.experimentId}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Bundle downloaded", variant: "success" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Download failed", description: msg, variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Generate / Export Training Package</CardTitle>
        {pkg && (
          <Badge variant="success" className="text-xs">
            IMMUTABLE
          </Badge>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={!ready || busy}>
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Package className="mr-2 h-4 w-4" />
            )}
            {busy ? "Generating…" : "Generate Training Package"}
          </Button>
          {pkg && (
            <Button variant="outline" onClick={download} disabled={downloading}>
              {downloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Download bundle (.zip)
            </Button>
          )}
        </div>

        {!ready && (
          <p className="text-xs text-muted-foreground">
            Select a dataset version and a training run above to enable generation.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <p className="text-xs text-destructive">{error}</p>
          </div>
        )}

        {pkg && (
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              package_id <span className="font-mono">{pkg.packageId}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Generating a package requires no GPU and no paid service. A package is immutable
              once issued; any change (config, data, resume) produces a new package.
            </p>
          </div>
        )}

        {instructions && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{instructions.title}</p>
            <ol className="list-decimal space-y-1 pl-5">
              {instructions.steps.map((step, i) => (
                <li key={i} className="text-xs text-muted-foreground">
                  {step}
                </li>
              ))}
            </ol>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Run the notebook as a committed / Save-Version run so /kaggle/working persists.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
