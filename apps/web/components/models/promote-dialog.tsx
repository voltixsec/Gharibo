"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import type { ModelRegistryEntry, ModelStatus } from "@gharibo/shared";

interface PromoteDialogProps {
  model: ModelRegistryEntry;
  newStatus: ModelStatus;
  onClose: () => void;
  onPromoted: () => void;
}

export function PromoteDialog({ model, newStatus, onClose, onPromoted }: PromoteDialogProps) {
  const { toast } = useToast();
  const [notes, setNotes] = useState(model.notes || "");
  const [promoting, setPromoting] = useState(false);

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await fetch(`/api/models/${model.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notes }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: `Promoted to ${newStatus}`, variant: "success" });
        onPromoted();
        onClose();
      } else {
        toast({ title: "Promotion failed", description: json.message, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setPromoting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Promote Model</DialogTitle>
          <DialogDescription>
            Promote {model.modelName} {model.version} from{" "}
            <Badge variant="secondary" className="text-xs">{model.status}</Badge>{" "}
            to{" "}
            <Badge variant="warning" className="text-xs">{newStatus}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="rounded-md border p-3 text-sm">
            <p><span className="text-muted-foreground">Name:</span> {model.modelName}</p>
            <p><span className="text-muted-foreground">Version:</span> {model.version}</p>
            <p><span className="text-muted-foreground">Base:</span> {model.baseModel || "—"}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Promotion Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why is this model being promoted?"
              className="min-h-[60px]"
            />
          </div>

          {newStatus === "ACCEPTED" && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Promotion to ACCEPTED
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Only ACCEPTED models may be called &ldquo;GHARIBO-V1&rdquo;. Ensure all evaluations
                pass before promoting.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handlePromote} disabled={promoting}>
            {promoting ? "Promoting..." : `Promote to ${newStatus}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
