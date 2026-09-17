/**
 * Canonical Harmony final-channel extraction.
 *
 * WHY THIS EXISTS
 * ---------------
 * GHARIBO-exp-001 Evaluation Attempt #6 persisted decoded *multi-channel* Harmony
 * output instead of isolating the final channel, even though the benchmark
 * contract scores only `final` (recorded as
 * `harmonySerializationDefect` in `governance/DEC-0048-exp001-training-objective-defect.json`).
 * `analysis` is chain-of-thought. It must never be scored, and it must never
 * reach a user. This module is the single, deterministic authority for turning a
 * raw model continuation into the one answer the application is allowed to show.
 *
 * CONTRACT
 * --------
 * 1. DETERMINISTIC. Pure function of its input string. No clock, no randomness,
 *    no network, no locale-dependent behaviour.
 * 2. FINAL-ONLY. The returned answer is the content of the LAST `final` channel
 *    segment. `analysis` and `commentary` content is never returned in any field,
 *    on any path, including error paths.
 * 3. FAIL-CLOSED. When no `final` segment exists the result is
 *    `{ ok: false, final: null }` with a machine-readable reason. There is NO
 *    fallback to raw text and NO semantic repair: a model that failed to emit a
 *    final channel produced an invalid answer, and the caller must be told so
 *    rather than shown something the model did not actually say.
 * 4. UNAMBIGUOUS TERMINATOR. The governed chat template ends a final message with
 *    `<|return|>`, which is distinct from `<|end|>` (used for non-final turns).
 *    Extraction accepts both, and reports which one terminated the answer.
 *
 * This module is plain ESM JavaScript so that BOTH the Next.js application and the
 * Node-based evaluation harnesses can import the one implementation — the same
 * arrangement the repository already uses for
 * `apps/web/lib/training/gold-authorization.mjs`.
 */

/** Harmony special tokens that delimit structure. */
export const HARMONY_SPECIALS = Object.freeze([
  "<|start|>",
  "<|end|>",
  "<|message|>",
  "<|channel|>",
  "<|return|>",
  "<|call|>",
  "<|constrain|>",
]);

/** Tokens that terminate a channel segment's content. */
const SEGMENT_TERMINATORS = Object.freeze([
  "<|return|>",
  "<|end|>",
  "<|call|>",
  "<|start|>",
  "<|constrain|>",
]);

/** Channels that are internal and must never be surfaced as an answer. */
export const HIDDEN_CHANNELS = Object.freeze(["analysis", "commentary"]);

/** The channel that carries the user-facing answer. */
export const FINAL_CHANNEL = "final";

const CHANNEL_HEADER = /<\|channel\|>([A-Za-z_][A-Za-z0-9_]*)\s*<\|message\|>/g;

/** Reasons a raw continuation can fail to yield a final answer. */
export const EXTRACTION_REASONS = Object.freeze({
  OK: "OK",
  EMPTY_INPUT: "EMPTY_INPUT",
  NO_CHANNEL_HEADER: "NO_CHANNEL_HEADER",
  NO_FINAL_CHANNEL: "NO_FINAL_CHANNEL",
  EMPTY_FINAL_CHANNEL: "EMPTY_FINAL_CHANNEL",
});

/**
 * Finds the end of the content that starts at `from`, i.e. the index of the
 * earliest segment terminator at or after `from` (or the string length).
 * @param {string} text
 * @param {number} from
 * @returns {{ end: number, terminator: string | null }}
 */
function findSegmentEnd(text, from) {
  let best = -1;
  let terminator = null;
  for (const token of SEGMENT_TERMINATORS) {
    const at = text.indexOf(token, from);
    if (at !== -1 && (best === -1 || at < best)) {
      best = at;
      terminator = token;
    }
  }
  return best === -1 ? { end: text.length, terminator: null } : { end: best, terminator };
}

/**
 * Splits a raw continuation into ordered channel segments.
 *
 * Content is taken verbatim between a `<|channel|>NAME<|message|>` header and the
 * next structural token. Nothing is normalised, trimmed or repaired.
 *
 * @param {unknown} text
 * @returns {Array<{ channel: string, content: string, terminator: string | null }>}
 */
export function parseChannelSegments(text) {
  const source = typeof text === "string" ? text : "";
  const segments = [];

  CHANNEL_HEADER.lastIndex = 0;
  let match;
  while ((match = CHANNEL_HEADER.exec(source)) !== null) {
    const channel = match[1];
    const contentStart = match.index + match[0].length;
    const { end, terminator } = findSegmentEnd(source, contentStart);

    segments.push({
      channel,
      content: source.slice(contentStart, end),
      terminator,
    });

    // Resume scanning after this segment's content so a terminator cannot be
    // mistaken for a header and no segment is ever counted twice.
    CHANNEL_HEADER.lastIndex = end;
  }

  return segments;
}

/**
 * Extracts the canonical application answer from a raw model continuation.
 *
 * @param {unknown} text Raw decoded continuation (with or without a leading
 *   `<|start|>assistant` marker). Non-string input fails closed.
 * @returns {{
 *   ok: boolean,
 *   final: string | null,
 *   reason: string,
 *   terminator: string | null,
 *   channelsFound: string[],
 *   analysisPresent: boolean,
 *   segmentCount: number,
 * }}
 */
export function extractFinalChannel(text) {
  const source = typeof text === "string" ? text : "";

  const base = {
    ok: false,
    final: null,
    terminator: null,
    channelsFound: [],
    analysisPresent: false,
    segmentCount: 0,
  };

  if (source.length === 0) {
    return { ...base, reason: EXTRACTION_REASONS.EMPTY_INPUT };
  }

  const segments = parseChannelSegments(source);
  const channelsFound = [];
  for (const segment of segments) {
    if (!channelsFound.includes(segment.channel)) channelsFound.push(segment.channel);
  }

  const analysisPresent = segments.some((s) => HIDDEN_CHANNELS.includes(s.channel));

  if (segments.length === 0) {
    return {
      ...base,
      reason: EXTRACTION_REASONS.NO_CHANNEL_HEADER,
    };
  }

  // The LAST final segment wins: a model that restates its answer has its most
  // recent statement treated as the answer, deterministically.
  let chosen = null;
  for (const segment of segments) {
    if (segment.channel === FINAL_CHANNEL) chosen = segment;
  }

  if (chosen === null) {
    return {
      ...base,
      reason: EXTRACTION_REASONS.NO_FINAL_CHANNEL,
      channelsFound,
      analysisPresent,
      segmentCount: segments.length,
    };
  }

  if (chosen.content.length === 0) {
    return {
      ...base,
      reason: EXTRACTION_REASONS.EMPTY_FINAL_CHANNEL,
      terminator: chosen.terminator,
      channelsFound,
      analysisPresent,
      segmentCount: segments.length,
    };
  }

  return {
    ok: true,
    final: chosen.content,
    reason: EXTRACTION_REASONS.OK,
    terminator: chosen.terminator,
    channelsFound,
    analysisPresent,
    segmentCount: segments.length,
  };
}

/**
 * Convenience wrapper returning only the answer, or `null`.
 *
 * Callers that must distinguish "no answer" from "empty answer" should use
 * `extractFinalChannel` and read `reason` instead.
 *
 * @param {unknown} text
 * @returns {string | null}
 */
export function finalChannelOrNull(text) {
  const result = extractFinalChannel(text);
  return result.ok ? result.final : null;
}

/**
 * True when `text` contains any channel content that must not be surfaced.
 *
 * Used as a defence-in-depth assertion on the application boundary: a response
 * that still carries hidden-channel content must not be rendered.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function containsHiddenChannel(text) {
  return parseChannelSegments(text).some((s) => HIDDEN_CHANNELS.includes(s.channel));
}
