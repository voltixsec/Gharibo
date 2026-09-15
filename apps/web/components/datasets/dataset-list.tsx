"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DatasetForm } from "./dataset-form";
import { Download, FolderGit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Dataset } from "@gharibo/shared";
import { formatDate } from "@/lib/utils";
import { EmptyState, ErrorState } from "@/components/status";

export function DatasetList() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/datasets");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setDatasets(json.data);
    } catch (err) {
      setDatasets([]);
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatasets();
  }, [fetchDatasets]);

  const handleExport = (id: string, name: string) => {
    window.open(`/api/datasets/${id}/export`, "_blank");
    toast({ title: `Exporting ${name}...`, variant: "success" });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Datasets</h2>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "New Dataset"}
        </Button>
      </div>

      {showForm && (
        <DatasetForm
          onCreated={() => {
            setShowForm(false);
            fetchDatasets();
          }}
        />
      )}

      {loading ? (
        <p className="py-6 text-sm text-muted-foreground">Loading datasets…</p>
      ) : error ? (
        <ErrorState title="Could not load datasets" message={error} />
      ) : datasets.length === 0 ? (
        <EmptyState
          icon={<FolderGit2 className="h-8 w-8" />}
          title="No assembled datasets yet"
          message="Create a dataset to freeze approved Data Factory records into a versioned training artifact."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {datasets.map((ds) => (
            <Card key={ds.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <FolderGit2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ds.name}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">{ds.version}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {ds.recordCount} records
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatDate(ds.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleExport(ds.id, ds.name)}>
                  <Download className="mr-2 h-4 w-4" />
                  Export JSONL
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
