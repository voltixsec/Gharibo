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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PromoteDialog } from "./promote-dialog";
import { ArrowUpCircle, Plus } from "lucide-react";
import type { ModelRegistryEntry, ModelStatus } from "@gharibo/shared";
import { formatDate } from "@/lib/utils";

const STATUS_BADGE: Record<string, "default" | "secondary" | "success" | "destructive" | "warning" | "outline"> = {
  EXPERIMENT: "secondary",
  CANDIDATE: "warning",
  ACCEPTED: "success",
  DEPRECATED: "destructive",
};

const NEXT_STATUS: Partial<Record<ModelStatus, ModelStatus>> = {
  EXPERIMENT: "CANDIDATE",
  CANDIDATE: "ACCEPTED",
};

export function RegistryTable() {
  const [models, setModels] = useState<ModelRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<ModelRegistryEntry | null>(null);

  const fetchModels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/models");
      const json = await res.json();
      if (json.code === 0) {
        setModels(json.data);
      }
    } catch {
      // ignore
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
      <CardContent>
        <div className="rounded-md border">
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
                    Loading...
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
                    <TableCell>{model.version}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {model.baseModel || "—"}
                    </TableCell>
                    <TableCell className="text-sm">{model.trainingMethod || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[model.status] || "outline"} className="text-xs">
                        {model.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(model.createdDate)}
                    </TableCell>
                    <TableCell>
                      {NEXT_STATUS[model.status] && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
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
