/**
 * deriveConversationTitle — deterministic titling from the first user message.
 *
 * These tests exist because the title is what the user navigates by. It must be
 * compact, sidebar-safe, in the SAME language as the question, and derived
 * without ever calling a model (no GPU wake, no cost, no extra latency on the
 * very first message).
 */
import { describe, it, expect } from "vitest";
import {
  deriveConversationTitle,
  isAutoTitleEligible,
  DEFAULT_CONVERSATION_TITLE,
  MAX_TITLE_CHARS,
} from "@/lib/conversation-title.mjs";

describe("default / degenerate input", () => {
  it("returns the default for non-string input", () => {
    expect(deriveConversationTitle(undefined)).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(deriveConversationTitle(null)).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(deriveConversationTitle(42)).toBe(DEFAULT_CONVERSATION_TITLE);
  });

  it("returns the default for blank or punctuation-only input", () => {
    expect(deriveConversationTitle("")).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(deriveConversationTitle("   ")).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(deriveConversationTitle("...")).toBe(DEFAULT_CONVERSATION_TITLE);
    expect(deriveConversationTitle("؟؟؟")).toBe(DEFAULT_CONVERSATION_TITLE);
  });
});

describe("language is preserved (never translated)", () => {
  it("produces an Arabic title from an Arabic first message", () => {
    const title = deriveConversationTitle(
      "عايز اعمل برنامج لإدارة المخازن والمشتريات للشركة",
    );
    // Still Arabic.
    expect(/[؀-ۿ]/.test(title)).toBe(true);
    // The lead-in is gone and the subject survives.
    expect(title).not.toMatch(/^عايز/);
    expect(title).toContain("المخازن");
    expect(title).toContain("المشتريات");
    expect(title).not.toBe(DEFAULT_CONVERSATION_TITLE);
  });

  it("produces a Latin title from an English first message", () => {
    const title = deriveConversationTitle(
      "Can you help me debug the provider routing issue in GHARIBO?",
    );
    expect(title).not.toBe(DEFAULT_CONVERSATION_TITLE);
    expect(/[A-Za-z]/.test(title)).toBe(true);
    // The subject survives; the politeness does not.
    expect(title.toLowerCase()).toContain("routing");
    expect(title.toLowerCase()).not.toMatch(/^(can you|help me)/);
  });

  it("keeps non-ASCII characters intact rather than transliterating", () => {
    const title = deriveConversationTitle("شرح تفاصيل النظام الجديد بالكامل");
    expect(/[؀-ۿ]/.test(title)).toBe(true);
    expect(title).not.toBe(DEFAULT_CONVERSATION_TITLE);
  });
});

describe("normalisation", () => {
  it("collapses a multiline message into a single line", () => {
    const title = deriveConversationTitle("line one\n\nline two\n\nline three");
    expect(title).not.toContain("\n");
    expect(title.split(" ").length).toBeGreaterThan(1);
  });

  it("trims leading/trailing punctuation and quotes", () => {
    const title = deriveConversationTitle('"what is the best approach here"?');
    expect(title.startsWith('"')).toBe(false);
    expect(title.endsWith("?")).toBe(false);
  });

  it("does not let a URL dominate the title", () => {
    const title = deriveConversationTitle(
      "please look at https://example.com/very/long/path?query=1234567890abcdef for context",
    );
    expect(title).not.toContain("https://");
    expect(title).not.toContain("example.com");
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
  });

  it("does not let a code blob dominate the title", () => {
    const title = deriveConversationTitle(
      "why does this fail ```function brokenCodeExample(){return null}``` when called",
    );
    expect(title).not.toContain("function");
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
  });

  it("strips long opaque ids", () => {
    const title = deriveConversationTitle(
      "explain error 4f3c9a8b1e2d7c6b5a4938271605f4e3 to me please",
    );
    expect(title).not.toContain("4f3c9a8b1e2d7c6b5a4938271605f4e3");
  });
});

describe("bounding", () => {
  it("bounds a very long first message to a sidebar-safe length", () => {
    const long =
      "I need you to carefully review this extremely long specification document " +
      "and then produce a detailed summary of every single section including all " +
      "of the edge cases that were mentioned by the original author last year";
    const title = deriveConversationTitle(long);
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    expect(title).not.toBe(DEFAULT_CONVERSATION_TITLE);
  });

  it("never splits a Unicode code point when truncating", () => {
    const title = deriveConversationTitle("م".repeat(200));
    // No replacement characters: the cut respected code point boundaries.
    expect(title).not.toContain("\uFFFD");
    expect(Array.from(title).length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
  });

  it("marks a truncation cleanly", () => {
    // Long words, so the title still exceeds the character budget AFTER the
    // 10-word cap and therefore genuinely needs truncating. (Short repeated
    // words do not: ten of them fit inside 60 characters.)
    const title = deriveConversationTitle("supercalifragilisticexpialidocious ".repeat(20));
    expect(title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("comparisons", () => {
  it("keeps both subjects of a comparison", () => {
    const title = deriveConversationTitle(
      "Compare NVIDIA NIM with OpenRouter for this project",
    );
    expect(title).toContain("NVIDIA");
    expect(title).toContain("OpenRouter");
    expect(title).toContain("vs");
    expect(title.toLowerCase()).not.toContain("for this project");
  });
});

describe("manual rename is authoritative", () => {
  it("treats only the default/blank title as auto-title eligible", () => {
    expect(isAutoTitleEligible(DEFAULT_CONVERSATION_TITLE)).toBe(true);
    expect(isAutoTitleEligible("")).toBe(true);
    expect(isAutoTitleEligible("   ")).toBe(true);
    expect(isAutoTitleEligible("برنامج المخازن")).toBe(false);
    expect(isAutoTitleEligible("Debug GHARIBO provider routing")).toBe(false);
  });
});
