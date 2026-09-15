"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Terminal, HardDrive, Cpu, Server } from "lucide-react";
import { StatusBadge, ErrorState, EmptyState, TruthNotice } from "@/components/status";

interface SystemInfo {
  providers: Array<{
    id: string;
    provider: string;
    modelId: string;
    displayName?: string;
    isActive: boolean;
    hasApiKey: boolean;
  }>;
  storage: {
    databasePath: string;
    databaseSizeBytes: number;
  };
  environment: {
    nodeVersion: string;
    platform: string;
    trainerUrl: string;
    inferenceUrl: string;
    researchUrl: string;
  };
  settings: Record<string, string>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A label/value row that survives long absolute paths and URLs. */
function FactRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

export function SystemDashboard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/system");
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.code !== 0) throw new Error(json.message || "Request failed");
      setInfo(json.data);
    } catch (err) {
      setInfo(null);
      setError(err instanceof Error ? err.message : "Failed to load system info");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  if (loading) {
    return <p className="py-6 text-sm text-muted-foreground">Loading system info…</p>;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load system diagnostics"
        message={error}
        onRetry={fetchInfo}
      />
    );
  }

  if (!info) {
    return (
      <EmptyState
        title="No system diagnostics available"
        message="The diagnostics endpoint returned no data."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <TruthNotice
        variant="info"
        title="Observed facts only"
        message="This page reports process, storage and provider configuration facts that can actually be read. It does not measure live accelerator, memory or network utilisation, and it shows no value it cannot read."
      />

      {/* Provider Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            <CardTitle>Provider Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {info.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers configured. Add one in Settings.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {info.providers.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {p.displayName || p.modelId}
                    </span>
                    <span className="shrink-0 rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                      {p.provider}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <StatusBadge
                      variant={p.hasApiKey ? "success" : "warning"}
                      label={p.hasApiKey ? "Key reference set" : "No key reference"}
                      detail="A stored reference only — the secret value is never read or shown."
                    />
                    <StatusBadge
                      variant={p.isActive ? "queued" : "neutral"}
                      label={p.isActive ? "Enabled" : "Disabled"}
                      detail="Configuration flag, not a verified connection."
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            <CardTitle>Storage</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <FactRow label="Database Path" value={info.storage.databasePath} mono />
            <FactRow
              label="Database Size"
              value={formatBytes(info.storage.databaseSizeBytes)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Environment */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <CardTitle>Environment</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <FactRow label="Node.js" value={info.environment.nodeVersion} />
            <FactRow label="Platform" value={info.environment.platform} />
            <FactRow label="Trainer URL" value={info.environment.trainerUrl} mono />
            <FactRow label="Inference URL" value={info.environment.inferenceUrl} mono />
            <FactRow label="Research URL" value={info.environment.researchUrl} mono />
          </div>
        </CardContent>
      </Card>

      {/* Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle>Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {Object.keys(info.settings).length === 0 ? (
            <p className="text-sm text-muted-foreground">No settings recorded.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(info.settings).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <span className="truncate text-sm text-muted-foreground" title={key}>
                    {key}
                  </span>
                  <span className="truncate text-sm font-medium" title={value}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
