"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Terminal, HardDrive, Cpu, Server } from "lucide-react";

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

export function SystemDashboard() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system");
      const json = await res.json();
      if (json.code === 0) {
        setInfo(json.data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading system info...</p>;
  }

  if (!info) {
    return <p className="text-sm text-muted-foreground">Failed to load system info</p>;
  }

  return (
    <div className="flex flex-col gap-6">
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
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {p.displayName || p.modelId}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {p.provider}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={p.hasApiKey ? "success" : "destructive"}
                      className="text-xs"
                    >
                      {p.hasApiKey ? "Key Set" : "No Key"}
                    </Badge>
                    <Badge
                      variant={p.isActive ? "success" : "secondary"}
                      className="text-xs"
                    >
                      {p.isActive ? "Active" : "Inactive"}
                    </Badge>
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
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Database Path</p>
              <p className="font-mono text-xs">{info.storage.databasePath}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Database Size</p>
              <p className="font-medium">{formatBytes(info.storage.databaseSizeBytes)}</p>
            </div>
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
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Node.js</p>
              <p className="font-medium">{info.environment.nodeVersion}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Platform</p>
              <p className="font-medium">{info.environment.platform}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Trainer URL</p>
              <p className="font-mono text-xs">{info.environment.trainerUrl}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Inference URL</p>
              <p className="font-mono text-xs">{info.environment.inferenceUrl}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Research URL</p>
              <p className="font-mono text-xs">{info.environment.researchUrl}</p>
            </div>
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
          <div className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(info.settings).map(([key, value]) => (
              <div key={key} className="flex justify-between rounded-md border p-2">
                <span className="text-muted-foreground">{key}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
