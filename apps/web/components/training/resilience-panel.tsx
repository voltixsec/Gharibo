"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RotateCcw } from "lucide-react";
import type { RunStatus, TrainingRun } from "@gharibo/shared";

const STATUS_BADGE: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  DRAFT: "secondary",
  QUEUED: "default",
  RUNNING: "warning",
  COMPLETED: "success",
  FAILED: "destructive",
  CANCELLED: "outline",
  INTERRUPTED: "warning",
  RESUMABLE: "default",
};

/** The allowed transitions (§10.2), mirrored client-side for display. */
const ALLOWED: Record<RunStatus, RunStatus[]> = {
  DRAFT: ["QUEUED"],
  QUEUED: ["RUNNING"],
  RUNNING: ["COMPLETED", "FAILED", "INTERRUPTED", "CANCELLED"],
  INTERRUPTED: ["RESUMABLE", "FAILED"],
  RESUMABLE: ["QUEUED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

interface ResiliencePanelProps {
  run: TrainingRun;
  onChanged?: () => void;
}

/**
 * Shows the free-tier resilience state and, when a run is INTERRUPTED/RESUMABLE,
 * lets the operator issue a NEW immutable resume package (never mutates a package).
 */
export function ResiliencePanel({ run, onChanged }: ResiliencePanelProps) {
  const { toast } = useToast();
  const [checkpointRef, setCheckpointRef] = useState("/kaggle/working");
  const [resumeFrom, setResumeFrom] = useState("outputs/checkpoint-50");
  const [busy, setBusy] = useState(false);

  const resumable = run.status === "RESUMABLE" || run.status === "INTERRUPTED";
  const nextStates = ALLOWED[run.status] ?? [];

  const mark = async (status: RunStatus) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/training-runs/${run.runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: `Run marked ${status}`, variant: "success" });
        onChanged?.();
      } else {
        toast({ title: "Update failed", description: json.message, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Update failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/training-runs/${run.runId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkpointRef, resumeFromCheckpoint: resumeFrom }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({
          title: "Resume package issued",
          description: `new package_id ${String(json.data.package.packageId).slice(0, 12)}…`,
          variant: "success",
        });
        onChanged?.();
      } else {
        toast({ title: "Resume failed", description: json.message, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Resume failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Resilience</CardTitle>
        <Badge variant={STATUS_BADGE[run.status] ?? "outline"} className="text-xs">
          {run.status}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          Next states: {nextStates.length > 0 ? nextStates.join(", ") : "terminal"}
        </p>
        <p className="text-xs text-muted-foreground">
          Only /kaggle/working (≤ 20 GB) survives a Kaggle session, so checkpoints, trainer state,
          metrics and the manifest are all written there. An experiment is never required to finish
          in a single session. INTERRUPTED vs FAILED is set explicitly on import, never guessed.
        </p>

        {/* Operator-set resilience transitions (§10.3). */}
        {(run.status === "RUNNING" || run.status === "INTERRUPTED") && (
          <div className="flex flex-wrap gap-2">
            {run.status === "RUNNING" && (
              <Button size="sm" variant="outline" onClick={() => mark("INTERRUPTED")} disabled={busy}>
                Mark INTERRUPTED
              </Button>
            )}
            {run.status === "INTERRUPTED" && (
              <>
                <Button size="sm" variant="outline" onClick={() => mark("RESUMABLE")} disabled={busy}>
                  Mark RESUMABLE (checkpoint + trainer_state confirmed)
                </Button>
                <Button size="sm" variant="outline" onClick={() => mark("FAILED")} disabled={busy}>
                  Mark FAILED
                </Button>
              </>
            )}
          </div>
        )}

        {resumable && (
          <div className="flex flex-col gap-3 rounded-md border p-3">
            <p className="text-sm font-medium">Resume from checkpoint</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checkpoint-ref">Re-attached output / dataset path</Label>
                <Input
                  id="checkpoint-ref"
                  value={checkpointRef}
                  onChange={(e) => setCheckpointRef(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="resume-from">Checkpoint directory</Label>
                <Input
                  id="resume-from"
                  value={resumeFrom}
                  onChange={(e) => setResumeFrom(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={resume} disabled={busy} className="self-start">
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="mr-2 h-4 w-4" />
              )}
              Issue resume package
            </Button>
            <p className="text-xs text-muted-foreground">
              Resume issues a NEW immutable package with checkpoint_policy.resume_from_checkpoint set.
            </p>
          </div>
        )}

        {!resumable && run.status !== "COMPLETED" && run.status !== "FAILED" && (
          <p className="text-xs text-muted-foreground">
            Mark the run RESUMABLE (after confirming a checkpoint and trainer_state.json exist) to
            issue a resume package.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
