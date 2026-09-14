"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatasetForm } from "./dataset-form";
import { Download, FolderGit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Dataset } from "@gharibo/shared";
import { formatDate } from "@/lib/utils";

export function DatasetList() {
  const { toast } = useToast();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchDatasets = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/datasets");
      const json = await res.json();
      if (json.code === 0) {
        setDatasets(json.data);
      }
    } catch {
      // ignore
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
      <div className="flex items-center justify-between">
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
        <p className="text-sm text-muted-foreground">Loading datasets...</p>
      ) : datasets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
            <FolderGit2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No datasets yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {datasets.map((ds) => (
            <Card key={ds.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <FolderGit2 className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{ds.name}</p>
                    <div className="flex items-center gap-2">
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
