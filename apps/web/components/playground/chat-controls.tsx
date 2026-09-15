"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ModelSelector, type ProviderSelection } from "./model-selector";
import { StatusBadge, TruthNotice } from "@/components/status";
import { Plus } from "lucide-react";

interface ChatControlsProps {
  onNewConversation: (data: {
    title: string;
    providerId: string | null;
    modelId: string | null;
    systemPrompt: string | null;
    temperature: number;
    maxTokens: number;
    toolsEnabled: boolean;
  }) => void;
}

export function ChatControls({ onNewConversation }: ChatControlsProps) {
  const [title, setTitle] = useState("");
  const [providerId, setProviderId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<string | null>(null);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [toolsEnabled, setToolsEnabled] = useState(false);

  /*
   * The provider selection carries BOTH the provider id and the concrete model
   * id. Keeping them together is what guarantees a selected model can never be
   * silently dropped on the way to the API.
   */
  const handleSelect = (selection: ProviderSelection) => {
    setProviderId(selection.providerId);
    setModelId(selection.modelId);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNewConversation({
      title: title || "New Conversation",
      providerId,
      // Pass the real selection through untouched.
      modelId,
      systemPrompt: systemPrompt || null,
      temperature,
      maxTokens,
      toolsEnabled,
    });
    setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="title">Conversation Title</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New Conversation"
        />
      </div>

      <ModelSelector value={providerId} onSelect={handleSelect} />

      {modelId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Resolved model</span>
          <StatusBadge variant="neutral" label={modelId} />
        </div>
      ) : (
        <TruthNotice
          variant="info"
          title="No model selected"
          message="The conversation will be created without a model. Choose a model above to record one with it."
        />
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="system-prompt">System Prompt</Label>
        <Textarea
          id="system-prompt"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder="You are a helpful assistant…"
          className="min-h-[60px]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Temperature: {temperature.toFixed(2)}</Label>
        <Slider
          min={0}
          max={2}
          step={0.01}
          value={[temperature]}
          onValueChange={(v) => setTemperature(v[0])}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="max-tokens">Max Tokens</Label>
        <Input
          id="max-tokens"
          type="number"
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value) || 2048)}
          min={1}
          max={32768}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="tools"
          checked={toolsEnabled}
          onCheckedChange={(v) => setToolsEnabled(v === true)}
        />
        <Label htmlFor="tools">Enable tools</Label>
      </div>

      <Button type="submit" className="w-full">
        <Plus className="mr-2 h-4 w-4" />
        New Conversation
      </Button>
    </form>
  );
}
