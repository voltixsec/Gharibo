"use client";

import { useProviders } from "@/hooks/use-providers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface ModelSelectorProps {
  value: string | null;
  onChange: (value: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const { providers, loading } = useProviders();

  if (loading) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <div className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (providers.length === 0) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label>Model</Label>
        <p className="text-sm text-muted-foreground">
          No providers configured. Add one in Settings.
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
          {providers
            .filter((p) => p.isActive)
            .map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName || p.modelId} ({p.provider})
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
