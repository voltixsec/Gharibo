"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Save } from "lucide-react";
import type { ProviderType } from "@gharibo/shared";

interface ProviderFormProps {
  onSaved: () => void;
}

const PROVIDER_TYPES: { value: ProviderType; label: string }[] = [
  { value: "openai_compatible", label: "OpenAI-Compatible" },
  { value: "ollama", label: "Ollama (Local)" },
  { value: "vllm", label: "vLLM (Local)" },
  { value: "huggingface", label: "Hugging Face" },
];

export function ProviderForm({ onSaved }: ProviderFormProps) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderType>("openai_compatible");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com");
  const [apiKeyRef, setApiKeyRef] = useState("");
  const [contextWindow, setContextWindow] = useState(4096);
  const [supportsVision, setSupportsVision] = useState(false);
  const [supportsTools, setSupportsTools] = useState(false);
  const [supportsStructuredOutput, setSupportsStructuredOutput] = useState(false);
  const [supportsReasoning, setSupportsReasoning] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelId || !baseUrl) {
      toast({ title: "Model ID and Base URL are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          modelId,
          baseUrl,
          apiKeyRef: apiKeyRef || null,
          contextWindow,
          supportsVision,
          supportsTools,
          supportsStructuredOutput,
          supportsReasoning,
          displayName: displayName || undefined,
          isActive: true,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: "Provider added", variant: "success" });
        onSaved();
        // Reset form
        setModelId("");
        setDisplayName("");
        setApiKeyRef("");
      } else {
        toast({ title: "Failed to add provider", description: json.message, variant: "destructive" });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Provider</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Provider Type</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as ProviderType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_TYPES.map((pt) => (
                    <SelectItem key={pt.value} value={pt.value}>
                      {pt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="model-id">Model ID</Label>
              <Input
                id="model-id"
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                placeholder="gpt-4o, llama-3.1-8b, etc."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="api-key-ref">API Key Reference (env var name)</Label>
              <Input
                id="api-key-ref"
                value={apiKeyRef}
                onChange={(e) => setApiKeyRef(e.target.value)}
                placeholder="OPENAI_API_KEY"
              />
              <p className="text-xs text-muted-foreground">
                Store the actual key in .env.local. Only the env var name goes here.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="context-window">Context Window</Label>
              <Input
                id="context-window"
                type="number"
                value={contextWindow}
                onChange={(e) => setContextWindow(parseInt(e.target.value) || 4096)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="display-name">Display Name (optional)</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="GPT-4o"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={supportsVision}
                onCheckedChange={(v) => setSupportsVision(v === true)}
              />
              <span className="text-sm">Supports Vision</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={supportsTools}
                onCheckedChange={(v) => setSupportsTools(v === true)}
              />
              <span className="text-sm">Supports Tools</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={supportsStructuredOutput}
                onCheckedChange={(v) => setSupportsStructuredOutput(v === true)}
              />
              <span className="text-sm">Structured Output</span>
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={supportsReasoning}
                onCheckedChange={(v) => setSupportsReasoning(v === true)}
              />
              <span className="text-sm">Reasoning</span>
            </label>
          </div>

          <Button type="submit" disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Add Provider"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
