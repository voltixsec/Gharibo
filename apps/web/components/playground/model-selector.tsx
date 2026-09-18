"use client";

import { useProviders } from "@/hooks/use-providers";
import { useRuntimeV1 } from "@/components/providers/runtime-status-provider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";
import type { ProviderConfig } from "@gharibo/shared";

interface ModelSelectorProps {
  /** `V1_RUNTIME_PROVIDER_ID` or a provider row id. */
  value: string | null;
  onChange: (selectionKey: string) => void;
  /** Reported back so the caller can persist the correct model identity. */
  onResolve?: (selectionKey: string, provider: ProviderConfig | null) => void;
}

/**
 * Model / provider selector.
 *
 * The selection key is the GHARIBO-V1 sentinel or a provider row id. It is NOT
 * written to `provider_id` — the caller converts it with `targetFromSelection`,
 * which maps the sentinel to `providerId: null, modelId: "GHARIBO-V1"`.
 */
export function ModelSelector({ value, onChange, onResolve }: ModelSelectorProps) {
  const { providers, loading } = useProviders();
  const { runtime, loading: runtimeLoading } = useRuntimeV1();
  const v1Configured = !!runtime?.config?.configured;

  const activeProviders = providers.filter((p) => p.isActive);

  const handleChange = (next: string) => {
    const provider = activeProviders.find((p) => p.id === next) ?? null;
    onResolve?.(next, provider);
    onChange(next);
  };

  if (loading || runtimeLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (activeProviders.length === 0 && !v1Configured) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <p className="text-xs text-muted-foreground">
          No model available. Add a provider in Settings, or configure the
          GHARIBO-V1 runtime with <code className="font-mono">GHARIBO_V1_BASE_URL</code>.
        </p>
      </div>
    );
  }

  const selectedProvider = activeProviders.find((p) => p.id === value) ?? null;
  const isV1 = value === V1_RUNTIME_PROVIDER_ID;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>Model</Label>
      <Select value={value ?? undefined} onValueChange={handleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {v1Configured && (
            <SelectItem value={V1_RUNTIME_PROVIDER_ID}>GHARIBO-V1</SelectItem>
          )}
          {activeProviders.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.displayName || p.modelId} ({p.provider})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <CapabilityLine isV1={isV1} provider={selectedProvider} />
    </div>
  );
}

/**
 * Truthful capability summary.
 *
 * Derived from the actual selected target, never hardcoded: the previous UI
 * implied capabilities (vision, tools) the model does not have.
 */
function CapabilityLine({
  isV1,
  provider,
}: {
  isV1: boolean;
  provider: ProviderConfig | null;
}) {
  if (isV1) {
    return (
      <p className="text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
        Text only · 3072-token context · no tools · no vision
      </p>
    );
  }

  if (!provider) return null;

  const capabilities = ["Text"];
  if (provider.supportsVision) capabilities.push("Vision");
  if (provider.supportsTools) capabilities.push("Tools");
  if (provider.supportsStructuredOutput) capabilities.push("Structured output");
  if (provider.supportsReasoning) capabilities.push("Reasoning");

  return (
    <p className="text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
      {capabilities.join(" · ")} · {provider.contextWindow}-token context
    </p>
  );
}
