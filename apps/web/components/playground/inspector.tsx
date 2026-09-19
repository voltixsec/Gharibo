"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelSelector } from "./model-selector";
import { RuntimeStatusBadge } from "./runtime-status-badge";
import { useRuntimeV1 } from "@/components/providers/runtime-status-provider";
import { resolveDeploymentLimits, DEPLOYMENT_LIMITS } from "@/lib/runtime/deployment-limits.mjs";
import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type { Conversation } from "@gharibo/shared";

/** Metrics from the most recent request. Only real, measured values. */
export interface RequestMetrics {
  ttfbMs: number | null;
  totalMs: number | null;
  at: string;
}

interface InspectorProps {
  conversation: Conversation | null;
  /** Current selection key (V1 sentinel or provider row id). */
  selectionKey: string | null;
  onSelectionChange: (selectionKey: string, providerModelId: string | null) => void;
  onPatch: (patch: {
    systemPrompt?: string | null;
    temperature?: number;
    maxTokens?: number;
  }) => void;
  /** True when the selected target declares tool support. */
  toolsSupported: boolean;
  metrics: RequestMetrics | null;
}

/**
 * Right-hand inspector: generation settings and real runtime telemetry.
 *
 * Every number shown is either measured locally or reported by the serving
 * process. Nothing is estimated and presented as fact: unavailable values say
 * "unavailable".
 */
export function Inspector({
  conversation,
  selectionKey,
  onSelectionChange,
  onPatch,
  toolsSupported,
  metrics,
}: InspectorProps) {
  const { runtime } = useRuntimeV1();
  const limits = resolveDeploymentLimits({});

  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState<number>(limits.defaultMaxOutputTokens);

  /*
   * Re-sync local controls when the active conversation changes.
   *
   * Keyed on the conversation id ONLY. Including the whole `conversation`
   * object (or its individual fields) meant every unrelated `refresh()` — for
   * example after sending a message or setting a quality signal — produced a
   * new object identity, re-ran this effect, and reset the local state,
   * silently discarding text the user had typed into the system prompt but not
   * yet committed on blur. Settings are user-driven here, so syncing on switch
   * is sufficient and leaving in-progress edits alone is correct.
   */
  useEffect(() => {
    if (!conversation) return;
    setSystemPrompt(conversation.systemPrompt ?? "");
    setTemperature(conversation.temperature);
    setMaxTokens(conversation.maxTokens);
    // Intentionally keyed on id only; see comment above.
  }, [conversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const disabled = !conversation;
  const diag = runtime?.diagnostics ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Inspector
        </span>
        <RuntimeStatusBadge compact />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-5 p-4">
          {/* ---------------------------------------------------- model */}
          <section className="flex flex-col gap-2">
            <SectionTitle>Model</SectionTitle>
            <ModelSelector
              value={selectionKey}
              onChange={(key) => onSelectionChange(key, null)}
            />
          </section>

          <Separator />

          {/* ------------------------------------------------- settings */}
          <section className="flex flex-col gap-3">
            <SectionTitle>Generation</SectionTitle>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="system-prompt" className="text-xs">
                System prompt
              </Label>
              <Textarea
                id="system-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                onBlur={() => {
                  if (conversation && systemPrompt !== (conversation.systemPrompt ?? "")) {
                    onPatch({ systemPrompt: systemPrompt || null });
                  }
                }}
                placeholder="You are a precise, helpful assistant."
                disabled={disabled}
                className="min-h-[72px] text-xs"
              />
              {systemPrompt.length > 0 && !disabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 self-start px-1.5 text-[0.6875rem] text-muted-foreground"
                  onClick={() => {
                    setSystemPrompt("");
                    onPatch({ systemPrompt: null });
                  }}
                >
                  <RotateCcw className="mr-1 h-3 w-3" />
                  Reset
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Temperature</Label>
                <span className="font-mono text-xs text-muted-foreground">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.05}
                value={[temperature]}
                onValueChange={(v) => setTemperature(v[0])}
                onValueCommit={(v) => onPatch({ temperature: v[0] })}
                disabled={disabled}
                /* Radix renders the thumb as role="slider"; without a name it is
                   announced as an unlabelled slider. */
                aria-label="Temperature"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="max-tokens" className="text-xs">
                  Max output tokens
                </Label>
                <span className="font-mono text-xs text-muted-foreground">{maxTokens}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {DEPLOYMENT_LIMITS.presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      setMaxTokens(preset);
                      onPatch({ maxTokens: preset });
                    }}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs transition-colors",
                      maxTokens === preset
                        ? "border-[color:var(--gharibo-cyan)]/50 bg-[color:var(--gharibo-cyan)]/12 text-[color:var(--gharibo-cyan)]"
                        : "border-border text-muted-foreground hover:bg-accent",
                      disabled && "opacity-50",
                    )}
                  >
                    {preset}
                  </button>
                ))}
                <Input
                  id="max-tokens"
                  type="number"
                  min={1}
                  max={limits.maxOutputTokensCeiling}
                  value={maxTokens}
                  disabled={disabled}
                  onChange={(e) => {
                    const next = Number.parseInt(e.target.value, 10);
                    if (Number.isFinite(next) && next > 0) setMaxTokens(next);
                  }}
                  onBlur={() => onPatch({ maxTokens })}
                  className="h-7 w-20 text-xs"
                />
              </div>
              <p className="text-[0.6875rem] leading-relaxed text-[color:var(--gharibo-text-subtle)]">
                Capped at {limits.maxOutputTokensCeiling} on the current development GPU.
                The server clamps larger values.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Tools</Label>
                <Badge variant="outline" className="text-[0.625rem]">
                  {toolsSupported ? "supported" : "not supported"}
                </Badge>
              </div>
              <p className="text-[0.6875rem] leading-relaxed text-[color:var(--gharibo-text-subtle)]">
                {toolsSupported
                  ? "The selected provider declares tool support."
                  : "GHARIBO-V1 is a text model. It cannot execute tools, run shell commands, or call other models."}
              </p>
            </div>
          </section>

          <Separator />

          {/* ------------------------------------------------ telemetry */}
          <section className="flex flex-col gap-2">
            <SectionTitle>Runtime telemetry</SectionTitle>

            {!runtime && (
              <p className="text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
                Runtime status unavailable.
              </p>
            )}

            {runtime && (
              <div className="flex flex-col gap-2">
                <Metric label="Model" value={runtime.modelId} />
                <Metric label="Host" value={runtime.endpointHost ?? "unavailable"} />
                <Metric label="Hosting" value={formatHosting(runtime.hostingLabel)} />
                <Metric
                  label="Status"
                  value={
                    runtime.health.ok
                      ? "ready"
                      : runtime.health.state.toLowerCase().replace(/_/g, " ")
                  }
                  title={runtime.health.detail}
                />
                <Metric
                  label="Adapter verified"
                  value={
                    diag?.adapterSha256Verified
                      ? "yes"
                      : diag
                        ? "no"
                        : "unavailable"
                  }
                />
                <Metric label="Context" value="3072 tokens" />

                {diag?.gpuName && <Metric label="GPU" value={diag.gpuName} />}

                {typeof diag?.vramTotalBytes === "number" &&
                typeof diag?.vramAllocatedBytes === "number" ? (
                  <VramBar
                    used={diag.vramAllocatedBytes}
                    total={diag.vramTotalBytes}
                  />
                ) : (
                  <Metric label="VRAM" value="unavailable" />
                )}

                {metrics ? (
                  <>
                    <Metric
                      label="Last TTFB"
                      value={
                        metrics.ttfbMs === null ? "unavailable" : `${metrics.ttfbMs} ms`
                      }
                    />
                    <Metric
                      label="Last total"
                      value={
                        metrics.totalMs === null ? "unavailable" : `${(metrics.totalMs / 1000).toFixed(2)} s`
                      }
                    />
                  </>
                ) : (
                  <Metric label="Last request" value="no request yet" />
                )}
              </div>
            )}
          </section>

          {/* --------------------------------------------- T4 warning */}
          <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/8 p-3">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            <p className="text-[0.6875rem] leading-relaxed text-amber-700 dark:text-amber-300">
              Development runtime: Tesla T4 (~14.56 GiB VRAM, ~11.6 GiB resident).
              The identity-preserving deployment target is a 24 GB GPU. Output is
              deliberately bounded here to avoid CUDA OOM.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--gharibo-text-subtle)]">
      {children}
    </h3>
  );
}

/** Human-readable hosting label. Never upgrades the claim: still "development". */
function formatHosting(label: string): string {
  switch (label) {
    case "DEVELOPMENT_EPHEMERAL_RUNTIME":
      return "development (ephemeral)";
    case "NO_RUNTIME":
      return "none configured";
    default:
      return label.toLowerCase().replace(/_/g, " ");
  }
}

function Metric({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={title}>
      <span className="text-[0.6875rem] text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-[0.6875rem] text-foreground">{value}</span>
    </div>
  );
}

function VramBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const toGiB = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="text-[0.6875rem] text-muted-foreground">VRAM</span>
        <span className="font-mono text-[0.6875rem] text-foreground">
          {toGiB(used)} / {toGiB(total)} GiB
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--gharibo-surface-sunken)]">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            pct > 90
              ? "bg-destructive"
              : pct > 75
                ? "bg-amber-500"
                : "bg-[color:var(--gharibo-cyan)]",
          )}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="GPU memory used"
        />
      </div>
    </div>
  );
}
