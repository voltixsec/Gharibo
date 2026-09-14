"use client";

import { useState, useEffect, useCallback } from "react";
import { ProviderForm } from "@/components/providers/provider-form";
import { ProviderCard } from "@/components/providers/provider-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Key } from "lucide-react";
import type { ProviderConfig } from "@gharibo/shared";

export default function SettingsPage() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/providers");
      const json = await res.json();
      if (json.code === 0) {
        setProviders(json.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchProviders();
  }, [fetchProviders, refreshKey]);

  return (
    <div className="container mx-auto max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure model providers and platform preferences.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Theme */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <Label>Light/Dark Mode</Label>
              <ThemeToggle />
            </div>
          </CardContent>
        </Card>

        {/* Provider Form */}
        <ProviderForm onSaved={() => setRefreshKey((k) => k + 1)} />

        {/* Provider List */}
        <div>
          <h2 className="mb-3 text-lg font-semibold">Configured Providers</h2>
          {providers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-2 py-12">
                <Key className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No providers configured. Add one above.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2">
              {providers.map((p) => (
                <ProviderCard
                  key={p.id}
                  provider={p}
                  onDeleted={() => setRefreshKey((k) => k + 1)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
