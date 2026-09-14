"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
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
import type { TrainingMethod } from "@gharibo/shared";

interface RunFormProps {
  onSaved: () => void;
}

const TARGET_MODULES = [
  "q_proj",
  "k_proj",
  "v_proj",
  "o_proj",
  "gate_proj",
  "up_proj",
  "down_proj",
];

export function RunForm({ onSaved }: RunFormProps) {
  const { toast } = useToast();
  const [baseModel, setBaseModel] = useState("meta-llama/Llama-3.1-8B-Instruct");
  const [method, setMethod] = useState<TrainingMethod>("lora");
  const [datasetId, setDatasetId] = useState("");
  const [epochs, setEpochs] = useState(3);
  const [learningRate, setLearningRate] = useState(0.0002);
  const [batchSize, setBatchSize] = useState(4);
  const [gradientAccumulation, setGradientAccumulation] = useState(1);
  const [loraRank, setLoraRank] = useState(16);
  const [loraAlpha, setLoraAlpha] = useState(32);
  const [targetModules, setTargetModules] = useState<string[]>(["q_proj", "v_proj"]);
  const [quantization, setQuantization] = useState("");
  const [seed, setSeed] = useState(42);
  const [device, setDevice] = useState("cuda");
  const [saving, setSaving] = useState(false);

  const toggleModule = (mod: string) => {
    setTargetModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/training-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseModel,
          method,
          datasetId: datasetId || null,
          epochs,
          learningRate,
          batchSize,
          gradientAccumulation,
          loraRank,
          loraAlpha,
          targetModules,
          quantization: quantization || null,
          seed,
          device,
        }),
      });
      const json = await res.json();
      if (json.code === 0) {
        toast({ title: "Training run saved as DRAFT", variant: "success" });
        onSaved();
      } else {
        toast({ title: "Failed to save", description: json.message, variant: "destructive" });
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
        <CardTitle>Training Run Configuration</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-model">Base Model</Label>
            <Input
              id="base-model"
              value={baseModel}
              onChange={(e) => setBaseModel(e.target.value)}
              placeholder="meta-llama/Llama-3.1-8B-Instruct"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as TrainingMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lora">LoRA</SelectItem>
                <SelectItem value="qlora">QLoRA</SelectItem>
                <SelectItem value="sft">SFT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dataset-id">Dataset ID (optional)</Label>
          <Input
            id="dataset-id"
            value={datasetId}
            onChange={(e) => setDatasetId(e.target.value)}
            placeholder="UUID of a dataset"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Epochs: {epochs}</Label>
            <Slider
              min={1}
              max={20}
              step={1}
              value={[epochs]}
              onValueChange={(v) => setEpochs(v[0])}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lr">Learning Rate</Label>
            <Input
              id="lr"
              type="number"
              step="0.00001"
              value={learningRate}
              onChange={(e) => setLearningRate(parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batch">Batch Size</Label>
            <Input
              id="batch"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 1)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="grad-accum">Gradient Accumulation</Label>
            <Input
              id="grad-accum"
              type="number"
              value={gradientAccumulation}
              onChange={(e) => setGradientAccumulation(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lora-rank">LoRA Rank</Label>
            <Input
              id="lora-rank"
              type="number"
              value={loraRank}
              onChange={(e) => setLoraRank(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lora-alpha">LoRA Alpha</Label>
            <Input
              id="lora-alpha"
              type="number"
              value={loraAlpha}
              onChange={(e) => setLoraAlpha(parseInt(e.target.value) || 0)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Target Modules</Label>
          <div className="flex flex-wrap gap-3">
            {TARGET_MODULES.map((mod) => (
              <label key={mod} className="flex items-center gap-2">
                <Checkbox
                  checked={targetModules.includes(mod)}
                  onCheckedChange={() => toggleModule(mod)}
                />
                <span className="text-sm">{mod}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quant">Quantization</Label>
            <Input
              id="quant"
              value={quantization}
              onChange={(e) => setQuantization(e.target.value)}
              placeholder="4bit, 8bit (for QLoRA)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="seed">Seed</Label>
            <Input
              id="seed"
              type="number"
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value) || 0)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="device">Device</Label>
            <Input
              id="device"
              value={device}
              onChange={(e) => setDevice(e.target.value)}
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save as DRAFT"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Training runs are persisted as DRAFT. Execution is P1 — no training is launched.
        </p>
      </CardContent>
    </Card>
  );
}
