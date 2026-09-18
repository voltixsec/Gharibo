"use client";

import { useProviders } from "@/hooks/use-providers";
import { useRuntimeV1 } from "@/hooks/use-runtime-v1";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";

interface ModelSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const { providers, loading } = useProviders();
  const { runtime, loading: runtimeLoading } = useRuntimeV1();
  const v1Configured = !!runtime?.config?.configured;

  if (loading || runtimeLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  const activeProviders = providers.filter((p) => p.isActive);

  if (activeProviders.length === 0 && !v1Configured) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <p className="text-sm text-muted-foreground">
          No providers configured. Add one in Settings, or set GHARIBO_V1_BASE_URL
          to use the GHARIBO-V1 runtime.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Model</Label>
      <Select value={value ?? undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {v1Configured && (
            <SelectItem value={V1_RUNTIME_PROVIDER_ID}>
              GHARIBO-V1 (runtime)
            </SelectItem>
          )}
          {activeProviders.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.displayName || p.modelId} ({p.provider})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
