/**
 * Streaming parser — chunk-boundary safety.
 *
 * The previous client did `text.split("\n")` per network chunk and discarded
 * anything that failed `JSON.parse`. A JSON record split across two chunks was
 * therefore silently dropped, losing response text with no error. These tests
 * pin the fix: buffer, emit only complete records, retain the remainder, and
 * never swallow a malformed record.
 */
import { describe, it, expect } from "vitest";
import { NdjsonStreamParser, parseLine, STREAM_EVENT } from "@/lib/runtime/stream-parser.mjs";

/** A permissive view of a stream event, for assertions in these tests. */
interface AnyEvent {
  type: string;
  delta?: string;
  done?: boolean;
  status?: string;
  modelId?: string;
  error?: { code: string; message: string };
}

/** Feeds a string one character at a time — the worst possible chunking. */
function feedByteByByte(parser: NdjsonStreamParser, payload: string): AnyEvent[] {
  const events: AnyEvent[] = [];
  for (const char of payload) {
    events.push(...(parser.push(char) as AnyEvent[]));
  }
  events.push(...(parser.flush() as AnyEvent[]));
  return events;
}

describe("complete records", () => {
  it("parses one complete record", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push('{"delta":"hello","done":false}\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: STREAM_EVENT.DELTA, delta: "hello", done: false });
  });

  it("parses several records arriving in one chunk", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push(
      '{"status":"generating"}\n{"delta":"a","done":false}\n{"delta":"b","done":true}\n',
    );
    expect(events.map((e) => e.type)).toEqual([
      STREAM_EVENT.STATUS,
      STREAM_EVENT.DELTA,
      STREAM_EVENT.DELTA,
    ]);
  });

  it("ignores blank lines", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push('\n\n{"delta":"x","done":true}\n\n');
    expect(events).toHaveLength(1);
  });
});

describe("chunk boundaries", () => {
  it("does not emit an incomplete record", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push('{"delta":"hel');
    expect(events).toHaveLength(0);
    const more = parser.push('lo","done":true}\n');
    expect(more).toHaveLength(1);
    expect(more[0]).toMatchObject({ delta: "hello" });
  });

  it("preserves every token when JSON is split at an arbitrary offset", () => {
    const payload =
      '{"delta":"The quick brown fox","done":false}\n{"delta":" jumps over","done":true}\n';

    // Try every possible single split point.
    for (let split = 0; split <= payload.length; split += 1) {
      const parser = new NdjsonStreamParser();
      const events: AnyEvent[] = [
        ...(parser.push(payload.slice(0, split)) as AnyEvent[]),
        ...(parser.push(payload.slice(split)) as AnyEvent[]),
        ...(parser.flush() as AnyEvent[]),
      ];
      const text = events
        .filter((e) => e.type === STREAM_EVENT.DELTA)
        .map((e) => e.delta ?? "")
        .join("");
      expect(text, `split at ${split}`).toBe("The quick brown fox jumps over");
    }
  });

  it("survives byte-by-byte delivery with no loss", () => {
    const payload =
      '{"status":"generating","modelId":"GHARIBO-V1"}\n{"delta":"abc","done":false}\n{"delta":"def","done":true}\n';
    const parser = new NdjsonStreamParser();
    const events = feedByteByByte(parser, payload);

    expect(events.filter((e) => e.type === STREAM_EVENT.STATUS)).toHaveLength(1);
    const text = events
      .filter((e) => e.type === STREAM_EVENT.DELTA)
      .map((e) => (e as { delta: string }).delta)
      .join("");
    expect(text).toBe("abcdef");
  });

  it("keeps a partial record buffered across many small chunks", () => {
    const parser = new NdjsonStreamParser();
    expect(parser.push('{"del')).toHaveLength(0);
    expect(parser.push('ta":"par')).toHaveLength(0);
    expect(parser.push('tial","do')).toHaveLength(0);
    const events = parser.push('ne":true}\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: "partial" });
  });
});

describe("terminal and error records", () => {
  it("maps the SSE [DONE] sentinel to a done event", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push("data: [DONE]\n");
    expect(events[0]).toMatchObject({ type: STREAM_EVENT.DONE });
  });

  it("reports a structured application error", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push(
      '{"error":{"code":"PROMPT_TOO_LARGE","message":"too big"},"done":true}\n',
    );
    expect(events[0].type).toBe(STREAM_EVENT.ERROR);
    expect(events[0]).toMatchObject({
      error: { code: "PROMPT_TOO_LARGE", message: "too big" },
      done: true,
    });
  });

  it("surfaces a malformed record instead of silently discarding it", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push("{not json at all}\n");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(STREAM_EVENT.ERROR);
    expect(events[0]).toMatchObject({
      error: { code: "MALFORMED_STREAM_RECORD" },
    });
  });

  it("does not lose a following good record after a malformed one", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push('{broken}\n{"delta":"ok","done":true}\n');
    expect(events.map((e) => e.type)).toEqual([STREAM_EVENT.ERROR, STREAM_EVENT.DELTA]);
  });
});

describe("SSE framing", () => {
  it("parses data: prefixed records", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push('data: {"delta":"hi","done":true}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: "hi" });
  });

  it("ignores SSE comments / keep-alives", () => {
    const parser = new NdjsonStreamParser();
    const events = parser.push(": keep-alive\n\n");
    expect(events).toHaveLength(0);
  });

  it("parses a fragmented SSE record", () => {
    const parser = new NdjsonStreamParser();
    expect(parser.push('data: {"del')).toHaveLength(0);
    const events = parser.push('ta":"split","done":true}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: "split" });
  });
});

describe("flush", () => {
  it("returns an unterminated final record rather than dropping it", () => {
    const parser = new NdjsonStreamParser();
    parser.push('{"delta":"truncated","done":true}');
    const events = parser.flush();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ delta: "truncated" });
  });

  it("returns nothing when the buffer is empty", () => {
    const parser = new NdjsonStreamParser();
    expect(parser.flush()).toEqual([]);
  });

  it("clears the buffer after flushing", () => {
    const parser = new NdjsonStreamParser();
    parser.push('{"delta":"a","done":true}');
    parser.flush();
    expect(parser.flush()).toEqual([]);
  });
});

describe("parseLine", () => {
  it("returns null for blank input and non-strings", () => {
    expect(parseLine("")).toBeNull();
    expect(parseLine("   ")).toBeNull();
    expect(parseLine(undefined as unknown as string)).toBeNull();
  });

  it("handles a done-only record", () => {
    expect(parseLine('{"done":true}')).toMatchObject({ type: STREAM_EVENT.DONE });
  });

  it("ignores a record with no recognised field", () => {
    expect(parseLine('{"unrelated":1}')).toBeNull();
  });

  it("ignores a JSON scalar", () => {
    expect(parseLine("42")).toBeNull();
  });
});
