"use client";

import { Button } from "@/components/ui/button";
import { Key, Trash2, Power, Globe } from "lucide-react";
import { StatusBadge } from "@/components/status";
import { useToast } from "@/hooks/use-toast";
import type { ProviderConfig } from "@gharibo/shared";

interface ProviderCardProps {
  provider: ProviderConfig;
  onChanged: () => void;
}

/**
 * A configured provider.
 *
 * Two hard rules govern this card:
 *   1. It never renders a secret. `apiKeyRef` is an environment-variable NAME,
 *      so it is shown as a reference and labelled as such.
 *   2. "Active" is a configuration flag, not a claim about connectivity. The
 *      card therefore says "Enabled" rather than implying a live connection it
 *      has not verified.
 */
export function ProviderCard({ provider, onChanged }: ProviderCardProps) {
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!confirm(`Delete provider "${provider.displayName || provider.modelId}"?`)) {
      return;
    }
    const res = await fetch(`/api/providers/${provider.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.code === 0) {
      toast({ title: "Provider deleted", variant: "success" });
      onChanged();
    } else {
      toast({
        title: "Delete failed",
        description: json.message,
        variant: "destructive",
      });
    }
  };

  const toggleActive = async () => {
    const res = await fetch(`/api/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !provider.isActive }),
    });
    if (res.ok) {
      toast({
        title: provider.isActive ? "Provider disabled" : "Provider enabled",
        variant: "success",
      });
      onChanged();
    } else {
      toast({ title: "Update failed", variant: "destructive" });
    }
  };

  const capabilities = [
    provider.supportsVision && "vision",
    provider.supportsTools && "tools",
    provider.supportsStructuredOutput && "structured",
    provider.supportsReasoning && "reasoning",
  ].filter((cap): cap is string => Boolean(cap));

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Key className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {provider.displayName || provider.modelId}
              </p>
              <StatusBadge variant="neutral" label={provider.provider} />
              <StatusBadge
                variant={provider.isActive ? "healthy" : "not-started"}
                label={provider.isActive ? "Enabled" : "Disabled"}
                detail="Configuration flag — not a verified connection"
              />
            </div>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
              {provider.modelId}
            </p>
            <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
              <Globe className="h-3 w-3 shrink-0" />
              <span className="truncate" title={provider.baseUrl}>
                {provider.baseUrl}
              </span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={toggleActive}
            title={provider.isActive ? "Disable provider" : "Enable provider"}
          >
            <Power className="mr-1 h-3 w-3" />
            {provider.isActive ? "Disable" : "Enable"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-xs text-destructive hover:text-destructive"
            onClick={handleDelete}
            title="Delete provider"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 sm:grid-cols-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Context Window</p>
          <p className="text-sm font-medium tabular-nums text-foreground">
            {provider.contextWindow.toLocaleString()}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Credential Reference</p>
          <p
            className="truncate font-mono text-xs text-foreground"
            title={provider.apiKeyRef ?? "none configured"}
          >
            {provider.apiKeyRef ?? "—"}
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground">
            env var name only; the value is never stored or shown
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Capabilities</p>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {capabilities.length > 0 ? (
              capabilities.map((cap) => (
                <span
                  key={cap}
                  className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {cap}
                </span>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">none declared</span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Added</p>
          <p className="text-xs text-muted-foreground">
            {new Date(provider.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}
