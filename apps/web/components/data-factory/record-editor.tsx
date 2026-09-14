"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Check, X, AlertTriangle } from "lucide-react";
import type { DataFactoryRecord, ValidationResult } from "@gharibo/shared";

interface RecordEditorProps {
  record: DataFactoryRecord | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordEditor({ record, onClose, onSaved }: RecordEditorProps) {
  const { toast } = useToast();
  const [input, setInput] = useState(record?.input || "");
  const [chosenOutput, setChosenOutput] = useState(record?.chosenOutput || "");
  const [domain, setDomain] = useState(record?.domain || "");
  const [language, setLanguage] = useState(record?.language || "");
  const [tags, setTags] = useState((record?.tags || []).join(", "));
  const [saving, setSaving] = useState(false);

  if (!record) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/data-factory/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input,
          chosenOutput: chosenOutput || null,
          domain: domain || null,
          language: language || null,
          tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: "Record updated", variant: "success" });
        onSaved();
        onClose();
      } else {
        toast({ title: "Update failed", description: json.message, variant: "destructive" });
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const validationResults: ValidationResult[] = record.validationResults || [];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Record</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="input">Input</Label>
            <Textarea
              id="input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chosen">Chosen Output</Label>
            <Textarea
              id="chosen"
              value={chosenOutput}
              onChange={(e) => setChosenOutput(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">Language</Label>
              <Input
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tags">Tags</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Validation Results */}
          <div className="flex flex-col gap-2">
            <Label>Validation Results</Label>
            {validationResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">No validation results yet</p>
            ) : (
              <div className="flex flex-col gap-1">
                {validationResults.map((vr, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {vr.status === "PASS" && <Check className="h-3 w-3 text-green-500" />}
                    {vr.status === "WARNING" && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {vr.status === "FAIL" && <X className="h-3 w-3 text-red-500" />}
                    <span className="text-muted-foreground">{vr.validator}:</span>
                    <span>{vr.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline">Status: {record.verificationStatus}</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
