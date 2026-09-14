/**
 * Record → Harmony mapping (architecture M2 §4).
 *
 * GHARIBO records are { input, context, chosen_output }-shaped; gpt-oss expects the
 * OpenAI Harmony response format. This module is the single source of truth for the
 * mapping and is asserted against the notebook's behaviour by a golden test.
 *
 * | GHARIBO field            | Harmony role → channel        |
 * |--------------------------|-------------------------------|
 * | task framing/instructions| developer                     |
 * | input + context          | user                          |
 * | reasoning (if present)   | assistant → analysis (HIDDEN) |
 * | chosen_output            | assistant → final             |
 * | tool interactions        | tool / assistant → commentary |
 *
 * `analysis` is chain-of-thought and must NEVER be shown to end users.
 */
import type { HarmonyMapping, HarmonyMessage } from "@gharibo/shared";
import { normalizeText, type CanonicalRecordInput } from "./canonical";

/**
 * Domain-agnostic developer framings, keyed by template id. Q1/Q7 (the concrete
 * first domain) are CTO-owned, so these stay generic on purpose.
 */
export const DEVELOPER_FRAMINGS: Record<string, string> = {
  "research-structured-knowledge":
    "Produce a well-structured, accurate answer grounded in the provided input and context. " +
    "Prefer precision over verbosity and never invent unsupported claims.",
  "generic-structured-output":
    "Respond with a clear, well-structured, and accurate answer. Do not include unsupported claims.",
};

const DEFAULT_FRAMING_ID = "generic-structured-output";

/** Resolves a framing template id to its (domain-agnostic) text. */
export function resolveDeveloperFraming(templateId: string): string {
  return DEVELOPER_FRAMINGS[templateId] ?? DEVELOPER_FRAMINGS[DEFAULT_FRAMING_ID];
}

/**
 * Renders the Harmony message array for a record.
 * The `analysis` channel is emitted only when the record carries reasoning; it is
 * never part of any user-facing output.
 */
export function renderHarmony(record: CanonicalRecordInput, mapping: HarmonyMapping): HarmonyMessage[] {
  const messages: HarmonyMessage[] = [];

  // developer — task framing (domain-agnostic template, not per-record data)
  messages.push({ role: "developer", content: resolveDeveloperFraming(mapping.developerTemplateId) });

  // user — input + context
  const input = normalizeText(record.input) ?? "";
  const context = normalizeText(record.context);
  const userContent = context ? `${input}\n\nContext:\n${context}` : input;
  messages.push({ role: "user", content: userContent });

  // assistant → analysis — reasoning only when present (hidden from end users)
  const reasoning = normalizeText(record.reasoning);
  if (reasoning) {
    messages.push({ role: "assistant", channel: "analysis", content: reasoning });
  }

  // assistant → final — the user-facing answer
  const finalContent = normalizeText(record.chosenOutput) ?? normalizeText(record.expectedOutput);
  if (finalContent !== null) {
    messages.push({ role: "assistant", channel: "final", content: finalContent });
  }

  return messages;
}
