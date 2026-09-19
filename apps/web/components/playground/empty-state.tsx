"use client";

import { GhariboMark } from "@/components/brand/gharibo-brand";
import { cn } from "@/lib/utils";
import { Brain, Code2, Braces, ListChecks, TrendingUp } from "lucide-react";

/**
 * First-use hero.
 *
 * Uses the official GHARIBO mark over the brand's faint coordinate grid, with
 * the orbital motif from the logo expressed as a slow radial ring — no
 * decorative blobs, no third-party graphics.
 *
 * Clicking a card POPULATES the composer; it never auto-sends, so the user
 * always keeps the last word before an inference request is made.
 */

interface EmptyStateProps {
  onPickPrompt: (prompt: string) => void;
  /** True when no runtime is reachable, so the copy stays honest. */
  runtimeUnavailable?: boolean;
}

const SMOKE_TESTS = [
  {
    icon: Brain,
    label: "Reasoning",
    hint: "Multi-step arithmetic",
    prompt:
      "A workshop starts with 48 units. It sells 17, then receives a shipment of 3 crates with 12 units each. How many units are there now? Show your steps.",
  },
  {
    icon: Code2,
    label: "Coding",
    hint: "Write a small function",
    prompt:
      "Write a Python function `chunk(items, size)` that splits a list into consecutive sublists of at most `size` items. Include a short docstring and one usage example.",
  },
  {
    icon: Braces,
    label: "Structured JSON",
    hint: "Strict schema output",
    prompt:
      'Return ONLY a JSON object matching this schema: {"name": string, "version": string, "dependencies": string[]}. Describe a small Python library called "orbital" at version 1.2.0 with two dependencies.',
  },
  {
    icon: ListChecks,
    label: "Instruction following",
    hint: "Exact format control",
    prompt:
      "List exactly three benefits of writing unit tests. Format each as a single line starting with a hyphen. Do not add an introduction or a conclusion.",
  },
  {
    icon: TrendingUp,
    label: "Business analysis",
    hint: "Quantity and price delta",
    prompt:
      "A product costs 42.50 per unit. We buy 240 units with a 7% volume discount, then resell at 59.99 each. Calculate the total cost, total revenue, and gross margin percentage. Show the arithmetic.",
  },
] as const;

export function EmptyState({ onPickPrompt, runtimeUnavailable = false }: EmptyStateProps) {
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden px-6 py-10">
      {/* Faint coordinate grid — the brand's technical texture. */}
      <div className="gharibo-grid pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative flex w-full max-w-2xl flex-col items-center text-center">
        {/* Mark with a slow radial ring, echoing the logo's orbit. */}
        <div className="relative mb-6 flex items-center justify-center">
          <span
            className="gharibo-animate-breathe absolute h-28 w-28 rounded-full bg-[color:var(--gharibo-glow)] blur-2xl"
            aria-hidden="true"
          />
          <span
            className="absolute h-24 w-24 rounded-full border border-[color:var(--gharibo-border-strong)]"
            aria-hidden="true"
          />
          <GhariboMark size={76} glow className="relative" priority />
        </div>

        <h1 className="text-balance text-2xl font-semibold tracking-tight text-foreground">
          What shall we test?
        </h1>
        <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
          {runtimeUnavailable
            ? "The GHARIBO-V1 runtime is not reachable right now. The prompts below will populate the composer so they are ready to send once it is."
            : "Start a conversation with GHARIBO-V1. Pick a prompt to populate the composer, or write your own."}
        </p>

        <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2">
          {SMOKE_TESTS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => onPickPrompt(item.prompt)}
                className={cn(
                  "group flex items-start gap-3 rounded-lg border border-border bg-[color:var(--gharibo-surface)] p-3.5 text-left transition-colors",
                  "hover:border-[color:var(--gharibo-border-strong)] hover:bg-accent",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[color:var(--gharibo-cyan)]/12 text-[color:var(--gharibo-cyan)]">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
