/**
 * EXP-002 — deterministic Harmony final-channel extraction regression.
 *
 * Required by `governance/DEC-0048-exp001-training-objective-defect.json`
 * (`exp002.requiredPreTrainingGates`): "Harmony final-channel extraction must be
 * deterministic and regression-tested before any future held-out evaluation".
 *
 * Evaluation Attempt #6 persisted decoded multi-channel output even though the
 * benchmark scores only `final`. These cases are synthetic and fully offline: no
 * model, no network, no fixture files. They pin the behaviour so the defect
 * cannot recur silently.
 */
import { describe, it, expect } from "vitest";
import {
  EXTRACTION_REASONS,
  containsHiddenChannel,
  extractFinalChannel,
  finalChannelOrNull,
  parseChannelSegments,
} from "@/lib/runtime/harmony-final.mjs";

const ANALYSIS = "I should compare the payload against the taxonomy before answering.";
const ANSWER = '{"entityType":"SYSTEM","externalKey":"system:security:sip-voip-intercom"}';

/** The canonical shape the governed template produces for a trained answer. */
const TRAINED_SHAPE =
  `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>` +
  `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`;

describe("extractFinalChannel", () => {
  it("returns the final channel from the canonical trained shape", () => {
    const result = extractFinalChannel(TRAINED_SHAPE);

    expect(result.ok).toBe(true);
    expect(result.final).toBe(ANSWER);
    expect(result.reason).toBe(EXTRACTION_REASONS.OK);
    expect(result.terminator).toBe("<|return|>");
    expect(result.analysisPresent).toBe(true);
    expect(result.channelsFound).toEqual(["analysis", "final"]);
  });

  it("never returns analysis content, on any path", () => {
    const result = extractFinalChannel(TRAINED_SHAPE);

    expect(result.final).not.toContain(ANALYSIS);
    expect(JSON.stringify(result)).not.toContain(ANALYSIS);
  });

  it("handles a final-only continuation", () => {
    const result = extractFinalChannel(
      `<|channel|>final<|message|>${ANSWER}<|return|>`,
    );

    expect(result.ok).toBe(true);
    expect(result.final).toBe(ANSWER);
    expect(result.analysisPresent).toBe(false);
  });

  it("handles a continuation with no leading start marker", () => {
    const result = extractFinalChannel(
      `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`,
    );

    expect(result.ok).toBe(true);
    expect(result.final).toBe(ANSWER);
  });

  it("accepts <|end|> as a terminator but reports which one was used", () => {
    const result = extractFinalChannel(
      `<|channel|>final<|message|>${ANSWER}<|end|>`,
    );

    expect(result.ok).toBe(true);
    expect(result.final).toBe(ANSWER);
    expect(result.terminator).toBe("<|end|>");
  });

  it("takes the LAST final segment when the model restates its answer", () => {
    const result = extractFinalChannel(
      `<|channel|>final<|message|>first<|end|>` +
        `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`,
    );

    expect(result.ok).toBe(true);
    expect(result.final).toBe(ANSWER);
  });

  it("FAILS CLOSED when only analysis was produced", () => {
    const result = extractFinalChannel(
      `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>`,
    );

    expect(result.ok).toBe(false);
    expect(result.final).toBeNull();
    expect(result.reason).toBe(EXTRACTION_REASONS.NO_FINAL_CHANNEL);
    expect(result.analysisPresent).toBe(true);
    expect(finalChannelOrNull(`<|channel|>analysis<|message|>${ANALYSIS}<|end|>`)).toBeNull();
  });

  it("FAILS CLOSED when no channel header is present (no raw-text fallback)", () => {
    const result = extractFinalChannel(ANSWER);

    expect(result.ok).toBe(false);
    expect(result.final).toBeNull();
    expect(result.reason).toBe(EXTRACTION_REASONS.NO_CHANNEL_HEADER);
  });

  it("FAILS CLOSED on empty input", () => {
    expect(extractFinalChannel("").reason).toBe(EXTRACTION_REASONS.EMPTY_INPUT);
    expect(extractFinalChannel("").final).toBeNull();
  });

  it("FAILS CLOSED on an empty final channel", () => {
    const result = extractFinalChannel("<|channel|>final<|message|><|return|>");

    expect(result.ok).toBe(false);
    expect(result.reason).toBe(EXTRACTION_REASONS.EMPTY_FINAL_CHANNEL);
  });

  it("does not surface commentary content as an answer", () => {
    const result = extractFinalChannel(
      `<|channel|>commentary<|message|>tool call here<|call|>`,
    );

    expect(result.ok).toBe(false);
    expect(result.final).toBeNull();
    expect(result.reason).toBe(EXTRACTION_REASONS.NO_FINAL_CHANNEL);
  });

  it("is deterministic across repeated calls", () => {
    const first = extractFinalChannel(TRAINED_SHAPE);
    for (let i = 0; i < 50; i += 1) {
      expect(extractFinalChannel(TRAINED_SHAPE)).toEqual(first);
    }
  });

  it("preserves the answer byte-for-byte, including newlines and braces", () => {
    const pretty = '{\n  "a": 1,\n  "b": [2, 3]\n}';
    const result = extractFinalChannel(
      `<|channel|>final<|message|>${pretty}<|return|>`,
    );

    expect(result.final).toBe(pretty);
  });

  it("is not confused by an angle bracket inside the JSON answer", () => {
    const answer = '{"note":"value <|not-a-token|> kept"}';
    const result = extractFinalChannel(
      `<|channel|>final<|message|>${answer}<|return|>`,
    );

    expect(result.ok).toBe(true);
    expect(result.final).toBe(answer);
  });

  it("tolerates a non-string input without throwing", () => {
    expect(extractFinalChannel(null).ok).toBe(false);
    expect(extractFinalChannel(undefined).ok).toBe(false);
    expect(extractFinalChannel(12345).reason).toBe(EXTRACTION_REASONS.EMPTY_INPUT);
  });
});

describe("parseChannelSegments", () => {
  it("returns segments in order with their terminators", () => {
    const segments = parseChannelSegments(TRAINED_SHAPE);

    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ channel: "analysis", terminator: "<|end|>" });
    expect(segments[1]).toMatchObject({ channel: "final", terminator: "<|return|>" });
  });

  it("never double-counts a segment", () => {
    const segments = parseChannelSegments(
      `<|channel|>final<|message|>a<|return|><|channel|>final<|message|>b<|return|>`,
    );

    expect(segments.map((s) => s.content)).toEqual(["a", "b"]);
  });
});

describe("containsHiddenChannel", () => {
  it("detects analysis and commentary", () => {
    expect(containsHiddenChannel(TRAINED_SHAPE)).toBe(true);
    expect(containsHiddenChannel("<|channel|>commentary<|message|>x<|call|>")).toBe(true);
  });

  it("is false for a clean final-only answer", () => {
    expect(containsHiddenChannel(`<|channel|>final<|message|>${ANSWER}<|return|>`)).toBe(false);
  });
});
