"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PreflightResult, PreflightCheckItem } from "@gharibo/shared";
import { formatDate } from "@/lib/utils";

interface PreflightPanelProps {
  baseModel?: string;
  datasetId?: string;
  result: PreflightResult | null;
  loading: boolean;
  onRefresh: () => void;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "READY") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "NOT_READY") return <XCircle className="h-4 w-4 text-red-500" />;
  return <AlertCircle className="h-4 w-4 text-amber-500" />;
}

export function PreflightPanel({
  result,
  loading,
  onRefresh,
}: PreflightPanelProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Running pre-flight checks...
          </span>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Click &ldquo;Run Pre-flight Check&rdquo; to verify your environment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const overall = result.overallReady;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>Pre-Flight Check</CardTitle>
          <Badge variant={overall ? "success" : "destructive"}>
            {overall ? "ENVIRONMENT READY" : "ENVIRONMENT NOT READY"}
          </Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          Re-check
        </Button>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          Checked at {formatDate(result.checkedAt)}
        </p>
        <div className="flex flex-col gap-2">
          {result.items.map((item: PreflightCheckItem) => (
            <div
              key={item.check}
              className="flex items-center gap-3 rounded-md border p-2"
            >
              <StatusIcon status={item.status} />
              <div className="flex-1">
                <p className="text-sm font-medium capitalize">
                  {item.check.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <Badge
                variant={
                  item.status === "READY"
                    ? "success"
                    : item.status === "NOT_READY"
                    ? "destructive"
                    : "warning"
                }
                className="text-xs"
              >
                {item.status.replace("_", " ")}
              </Badge>
            </div>
          ))}
        </div>

        {!overall && (
          <div className="mt-4 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Environment Not Ready
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">
              Some pre-flight checks failed. Training execution is P1, but the environment
              must be ready before launching. Ensure PyTorch, CUDA, and a compatible GPU are available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
