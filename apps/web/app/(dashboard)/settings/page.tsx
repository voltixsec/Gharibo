"use client";

import { useState, useEffect, useCallback } from "react";
import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderCard } from "@/components/providers/provider-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { PageHeader } from "@/components/page-header";
import { PageContent } from "@/components/page-content";
import { StateCard, EmptyState, ErrorState, TruthNotice } from "@/components/status";
import { Label } from "@/components/ui/label";
import { Key, Palette, ShieldCheck } from "lucide-react";
import type { ProviderConfig } from "@gharibo/shared";

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProviders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/providers");
      const json = await res.json();
      if (json.code === 0) {
        setProviders(json.data as ProviderConfig[]);
        setError(null);
      } else {
        setError(json.message ?? "Failed to load providers");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Model providers, appearance and platform preferences."
      />
      <PageContent width="default">
        {/* Appearance */}
        <StateCard
          title="Appearance"
          icon={<Palette className="h-4 w-4" />}
          description="Theme follows the system by default."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label>Light / Dark Mode</Label>
            <ThemeToggle />
          </div>
        </StateCard>

        {/* Security posture */}
        <StateCard
          title="Credentials"
          icon={<ShieldCheck className="h-4 w-4" />}
          description="How GHARIBO stores provider credentials."
        >
          <TruthNotice
            variant="verified"
            title="API keys are stored as references only"
            message="GHARIBO records the environment-variable name, never the key value. The raw secret stays in your local environment and is never written to the database, an API response, or this interface."
          />
        </StateCard>

        {/* Add provider */}
        <ProviderForm onSaved={refresh} />

        {/* Configured providers */}
        <StateCard
          title="Configured Providers"
          icon={<Key className="h-4 w-4" />}
          description="Providers available to the Playground and Research Gym."
          actions={
            <span className="text-xs text-muted-foreground">
              {providers.length} configured
            </span>
          }
        >
          {loading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-32 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : error ? (
            <ErrorState
              title="Could not load providers"
              message={error}
              onRetry={fetchProviders}
            />
          ) : providers.length === 0 ? (
            <EmptyState
              icon={<Key className="h-6 w-6" />}
              title="No providers configured"
              message="Add a provider above to make models available in the Playground and Research Gym."
            />
          ) : (
            <div className="space-y-2">
              {providers.map((p) => (
                <ProviderCard key={p.id} provider={p} onChanged={refresh} />
              ))}
            </div>
          )}
        </StateCard>
      </PageContent>
    </>
  );
}
