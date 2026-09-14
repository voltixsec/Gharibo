"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Key, Trash2, Power } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProviderConfig } from "@gharibo/shared";

interface ProviderCardProps {
  provider: ProviderConfig;
  onDeleted: () => void;
}

export function ProviderCard({ provider, onDeleted }: ProviderCardProps) {
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!confirm(`Delete provider "${provider.displayName || provider.modelId}"?`)) return;
    const res = await fetch(`/api/providers/${provider.id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.code === 0) {
      toast({ title: "Provider deleted", variant: "success" });
      onDeleted();
    } else {
      toast({ title: "Delete failed", description: json.message, variant: "destructive" });
    }
  };

  const toggleActive = async () => {
    const res = await fetch(`/api/providers/${provider.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !provider.isActive }),
    });
    if (res.ok) {
      onDeleted();
    }
  };

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Key className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">
                {provider.displayName || provider.modelId}
              </p>
              <Badge variant="outline" className="text-xs">
                {provider.provider}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {provider.modelId} · {provider.baseUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={provider.isActive ? "success" : "secondary"}
            className="text-xs"
          >
            {provider.isActive ? "Active" : "Inactive"}
          </Badge>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={toggleActive}>
            <Power className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
