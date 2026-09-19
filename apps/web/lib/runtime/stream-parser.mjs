/**
 * Incremental newline-delimited JSON parser for the chat stream.
 *
 * WHY THIS EXISTS
 * ---------------
 * The previous client did `text.split("\n")` on each network chunk and threw
 * away anything that failed `JSON.parse`. A network chunk is NOT guaranteed to
 * contain whole records: a single JSON object can be split across two chunks at
 * an arbitrary byte offset. When that happened the record was silently dropped,
 * losing response text with no error and no trace.
 *
 * This parser buffers, emits only COMPLETE records, and retains the trailing
 * partial record for the next chunk. Nothing is swallowed, and no line is ever
 * parsed twice.
 *
 * It is transport-agnostic: the same parser handles the application's
 * newline-delimited JSON stream and OpenAI-style `data: {...}\n\n` SSE.
 */

/** Normalised event kinds the UI understands. */
export const STREAM_EVENT = Object.freeze({
  STATUS: "status",
  DELTA: "delta",
  ERROR: "error",
  DONE: "done",
});

export class NdjsonStreamParser {
  constructor() {
    /** @type {string} */
    this.buffer = "";
  }

  /**
   * Feeds a chunk and returns every COMPLETE event it completed.
   *
   * @param {string} chunk
   * @returns {Array<{type: string, delta?: string, done?: boolean, status?: string, modelId?: string, error?: {code: string, message: string}}>}
   */
  push(chunk) {
    if (typeof chunk !== "string" || chunk.length === 0) return [];

    this.buffer += chunk;
    const events = [];

    let newlineIndex = this.buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      const event = parseLine(line);
      if (event) events.push(event);
      newlineIndex = this.buffer.indexOf("\n");
    }

    return events;
  }

  /**
   * Returns the event for a final unterminated record, if any.
   *
   * A well-formed stream ends with a newline, so this is normally empty. It
   * exists so a truncated final record is surfaced rather than lost.
   *
   * @returns {Array<{type: string}>}
   */
  flush() {
    const remainder = this.buffer.trim();
    this.buffer = "";
    if (remainder.length === 0) return [];
    const event = parseLine(remainder);
    return event ? [event] : [];
  }
}

/**
 * Parses one wire line into a normalised event.
 *
 * Handles both the application's bare-JSON lines and SSE `data:` framing.
 * Returns null for blank lines, comments and the SSE `[DONE]` sentinel is
 * mapped to an explicit done event.
 *
 * @param {string} line
 */
export function parseLine(line) {
  if (typeof line !== "string") return null;

  let payload = line.trim();
  if (payload.length === 0) return null;

  // SSE framing.
  if (payload.startsWith("data:")) {
    payload = payload.slice(5).trim();
    if (payload.length === 0) return null;
  }
  // SSE comment / keep-alive.
  if (payload.startsWith(":")) return null;

  if (payload === "[DONE]") {
    return { type: STREAM_EVENT.DONE, done: true };
  }

  let record;
  try {
    record = JSON.parse(payload);
  } catch {
    // A malformed line is reported, never silently discarded.
    return {
      type: STREAM_EVENT.ERROR,
      error: {
        code: "MALFORMED_STREAM_RECORD",
        message: "The runtime sent a record that could not be parsed.",
      },
    };
  }

  if (record === null || typeof record !== "object") return null;

  // Structured error from the application route.
  if (record.error) {
    const err = record.error;
    return {
      type: STREAM_EVENT.ERROR,
      done: true,
      error: {
        code: typeof err.code === "string" ? err.code : "STREAM_ERROR",
        message:
          typeof err.message === "string" ? err.message : "The runtime reported an error.",
      },
    };
  }

  if (typeof record.status === "string") {
    return {
      type: STREAM_EVENT.STATUS,
      status: record.status,
      modelId: typeof record.modelId === "string" ? record.modelId : undefined,
    };
  }

  if (typeof record.delta === "string") {
    return {
      type: STREAM_EVENT.DELTA,
      delta: record.delta,
      done: Boolean(record.done),
    };
  }

  if (record.done === true) {
    return { type: STREAM_EVENT.DONE, done: true };
  }

  return null;
}
