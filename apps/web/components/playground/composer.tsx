"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ArrowUp, Paperclip, Square } from "lucide-react";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  /** True while a response is in flight. */
  busy?: boolean;
  /** True when generation can genuinely be cancelled. */
  canStop?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Short model label shown as a chip. */
  modelLabel?: string;
  /** Safe output-token budget for the current runtime. */
  tokenBudget?: number;
  /**
   * DOM id for the composer region, so a skip link can jump to it.
   *
   * The id goes on the REGION, not the textarea: the textarea is disabled when
   * no conversation is selected, and a disabled control is not focusable — so a
   * skip link pointing at it would silently drop focus onto <body>.
   */
  regionId?: string;
}

/**
 * Playground composer.
 *
 * Keyboard contract: Enter sends, Shift+Enter inserts a newline.
 *
 * Truthfulness: the attach control is rendered DISABLED with an explicit
 * tooltip. GHARIBO-V1 has no vision capability, so an active attachment button
 * would advertise something that does not exist. A Stop control is only shown
 * when generation can actually be cancelled.
 */
export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  busy = false,
  canStop = false,
  disabled = false,
  disabledReason,
  modelLabel,
  tokenBudget,
  regionId,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea, capped so a long prompt cannot swallow the layout.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && !busy && value.trim()) onSend();
    }
  };

  const canSend = !disabled && !busy && value.trim().length > 0;

  return (
    <div
      id={regionId}
      tabIndex={-1}
      className="border-t border-border bg-[color:var(--gharibo-surface)] px-4 py-3 focus:outline-none"
    >
      <div
        className={cn(
          "mx-auto flex max-w-3xl flex-col rounded-xl border border-border bg-[color:var(--gharibo-surface-elevated)] transition-colors",
          "focus-within:border-[color:var(--gharibo-cyan)]/50",
        )}
      >
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled ? (disabledReason ?? "Select a conversation first") : "Message GHARIBO-V1…"
          }
          disabled={disabled}
          rows={1}
          aria-label="Message"
          className="min-h-[52px] resize-none border-0 bg-transparent px-4 py-3.5 text-sm shadow-none focus-visible:ring-0"
        />

        <div className="flex items-center justify-between gap-2 px-3 pb-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {modelLabel && (
              <span className="truncate rounded-full border border-border px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                {modelLabel}
              </span>
            )}
            {typeof tokenBudget === "number" && (
              <span className="hidden text-[0.6875rem] text-[color:var(--gharibo-text-subtle)] sm:inline">
                max {tokenBudget} output tokens
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                {/* Disabled, not hidden: the limitation is stated, not faked. */}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground"
                  disabled
                  aria-label="Attachments unavailable"
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Attachments are not supported by GHARIBO-V1</TooltipContent>
            </Tooltip>

            {busy && canStop && onStop ? (
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-8 w-8"
                onClick={onStop}
                aria-label="Stop generating"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                className={cn(
                  "h-8 w-8",
                  canSend && "bg-[color:var(--gharibo-cyan)] text-[color:var(--gharibo-bg)] hover:bg-[color:var(--gharibo-cyan-bright)]",
                )}
                onClick={onSend}
                disabled={!canSend}
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <p className="mx-auto mt-2 max-w-3xl text-center text-[0.6875rem] text-[color:var(--gharibo-text-subtle)]">
        Enter sends · Shift+Enter adds a line
      </p>
    </div>
  );
}
