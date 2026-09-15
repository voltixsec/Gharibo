"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PromoteDialog } from "./promote-dialog";
import { ArrowUpCircle } from "lucide-react";
import type { ModelRegistryEntry, ModelStatus } from "@gharibo/shared";
import { formatDate } from "@/lib/utils";
import { ErrorState, StatusBadge, TruthNotice } from "@/components/status";
import type { StatusVariant } from "@/components/status";

/**
 * Registry promotion states use the shared vocabulary. Only ACCEPTED is
 * green — a candidate is not a result, and a deprecated model is not an
 * error, it is a lifecycle end state.
 */
const STATUS_VARIANT: Record<string, StatusVariant> = {
  EXPERIMENT: "neutral",
  CANDIDATE: "pending",
  ACCEPTED: "success",
  DEPRECATED: "not-run",
};

const NEXT_STATUS: Partial<Record<ModelStatus, ModelStatus>> = {
  EXPERIMENT: "CANDIDATE",
  CANDIDATE: "ACCEPTED",
};

export function RegistryTable() {
  const [models, setModels] = useState<ModelRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<ModelRegistryEntry | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/models");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setModels(json.data);
    } catch (err) {
      setModels([]);
      setError(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Registry</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <TruthNotice
          variant="info"
          title="Registered artifacts, not promotions"
          message="An entry here does not by itself mean a governed model was promoted — check the governance state for that decision."
        />

        {error ? (
          <ErrorState title="Could not load the model registry" message={error} />
        ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Base Model</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No models registered yet
                  </TableCell>
                </TableRow>
              ) : (
                models.map((model) => (
                  <TableRow key={model.id}>
                    <TableCell className="font-medium">{model.modelName}</TableCell>
                    <TableCell className="tabular-nums">{model.version}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {model.baseModel || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{model.trainingMethod || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge
                        variant={STATUS_VARIANT[model.status] || "neutral"}
                        label={model.status}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(model.createdDate)}
                    </TableCell>
                    <TableCell>
                      {NEXT_STATUS[model.status] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 whitespace-nowrap text-xs"
                          onClick={() => setPromoting(model)}
                        >
                          <ArrowUpCircle className="mr-1 h-3 w-3" />
                          Promote to {NEXT_STATUS[model.status]}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        )}

        {promoting && (
          <PromoteDialog
            model={promoting}
            newStatus={NEXT_STATUS[promoting.status]!}
            onClose={() => setPromoting(null)}
            onPromoted={fetchModels}
          />
        )}
      </CardContent>
    </Card>
  );
}
