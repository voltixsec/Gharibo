/**
 * Deployment token safety.
 *
 * These tests exist because the UI historically defaulted to ~2048 output tokens
 * while the canonical runtime defaulted to 3072, on a Tesla T4 where the model
 * already occupies ~11.6 GiB of ~14.56 GiB. A client could OOM the GPU simply by
 * asking for a large max_tokens.
 *
 * The contract under test:
 *   1. There is a safe default and a hard server-side ceiling.
 *   2. A request asking for more than the ceiling is clamped, and told so.
 *   3. A prompt that cannot fit the context is rejected BEFORE any GPU work.
 *   4. The model's official 3072-token context identity is unchanged.
 */
import { describe, it, expect } from "vitest";
import {
  resolveDeploymentLimits,
  clampMaxOutputTokens,
  estimateTokens,
  estimatePromptTokens,
  validateContextBudget,
  BUDGET_REASON,
  V1_CONTEXT_LENGTH,
  DEPLOYMENT_LIMITS,
} from "@/lib/runtime/deployment-limits.mjs";

describe("identity vs deployment limits", () => {
  it("keeps the model's official 3072-token context identity", () => {
    expect(V1_CONTEXT_LENGTH).toBe(3072);
    expect(resolveDeploymentLimits({}).contextLength).toBe(3072);
  });

  it("defaults to a T4-safe output budget", () => {
    const limits = resolveDeploymentLimits({});
    expect(limits.defaultMaxOutputTokens).toBe(256);
    expect(limits.maxOutputTokensCeiling).toBe(512);
  });
});

describe("clampMaxOutputTokens", () => {
  const limits = resolveDeploymentLimits({});

  it("clamps an oversized request to the ceiling and reports it", () => {
    const result = clampMaxOutputTokens(4096, limits);
    expect(result.value).toBe(512);
    expect(result.clamped).toBe(true);
    expect(result.requested).toBe(4096);
  });

  it("clamps the historical 3072 default down to the ceiling", () => {
    expect(clampMaxOutputTokens(3072, limits).value).toBe(512);
  });

  it("passes through a value already inside the range", () => {
    const result = clampMaxOutputTokens(128, limits);
    expect(result.value).toBe(128);
    expect(result.clamped).toBe(false);
  });

  it("falls back to the safe default for missing or invalid values", () => {
    expect(clampMaxOutputTokens(undefined, limits).value).toBe(256);
    expect(clampMaxOutputTokens(null, limits).value).toBe(256);
    expect(clampMaxOutputTokens(0, limits).value).toBe(256);
    expect(clampMaxOutputTokens(-5, limits).value).toBe(256);
    expect(clampMaxOutputTokens("nonsense", limits).value).toBe(256);
    expect(clampMaxOutputTokens(Number.NaN, limits).value).toBe(256);
  });

  it("honours environment overrides for a larger GPU", () => {
    const big = resolveDeploymentLimits({
      GHARIBO_MAX_OUTPUT_TOKENS_CEILING: "4096",
      GHARIBO_DEFAULT_MAX_OUTPUT_TOKENS: "1024",
    });
    expect(big.maxOutputTokensCeiling).toBe(4096);
    expect(big.defaultMaxOutputTokens).toBe(1024);
    expect(clampMaxOutputTokens(8192, big).value).toBe(4096);
  });

  it("never lets a misconfigured default exceed the ceiling", () => {
    const bad = resolveDeploymentLimits({
      GHARIBO_MAX_OUTPUT_TOKENS_CEILING: "256",
      GHARIBO_DEFAULT_MAX_OUTPUT_TOKENS: "9999",
    });
    expect(bad.defaultMaxOutputTokens).toBe(256);
  });
});

describe("estimateTokens", () => {
  it("returns 0 for empty input and rounds up otherwise", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens("abc")).toBeGreaterThan(0);
  });

  it("is monotonic in length", () => {
    expect(estimateTokens("x".repeat(400))).toBeGreaterThan(estimateTokens("x".repeat(40)));
  });

  it("counts per-message framing overhead", () => {
    const one = estimatePromptTokens([{ role: "user", content: "hi" }]);
    const two = estimatePromptTokens([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hi" },
    ]);
    expect(two).toBeGreaterThan(one);
  });
});

describe("validateContextBudget", () => {
  const limits = resolveDeploymentLimits({});

  it("accepts a normal request and reports the clamped budget", () => {
    const result = validateContextBudget({
      messages: [{ role: "user", content: "Hello there" }],
      systemPrompt: null,
      maxTokens: 256,
      limits,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe(BUDGET_REASON.OK);
    expect(result.maxTokens).toBe(256);
    expect(result.clamped).toBe(false);
  });

  it("clamps rather than rejects an oversized output request", () => {
    const result = validateContextBudget({
      messages: [{ role: "user", content: "Hello" }],
      maxTokens: 9999,
      limits,
    });
    expect(result.ok).toBe(true);
    expect(result.maxTokens).toBe(512);
    expect(result.clamped).toBe(true);
    expect(result.requestedMaxTokens).toBe(9999);
  });

  it("rejects an oversized prompt before generation", () => {
    const result = validateContextBudget({
      messages: [{ role: "user", content: "x".repeat(30_000) }],
      maxTokens: 256,
      limits,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(BUDGET_REASON.PROMPT_TOO_LARGE);
    expect(result.detail).toContain("development runtime");
  });

  it("rejects a prompt that fits only if no output were produced", () => {
    const result = validateContextBudget({
      messages: [{ role: "user", content: "y".repeat(9500) }],
      maxTokens: 512,
      limits,
    });
    expect(result.ok).toBe(false);
    expect([BUDGET_REASON.BUDGET_EXCEEDED, BUDGET_REASON.PROMPT_TOO_LARGE]).toContain(
      result.reason,
    );
  });

  it("rejects an empty request", () => {
    const result = validateContextBudget({ messages: [], maxTokens: 256, limits });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe(BUDGET_REASON.EMPTY_REQUEST);
  });

  it("counts the system prompt against the budget", () => {
    const without = validateContextBudget({
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 256,
      limits,
    });
    const withSystem = validateContextBudget({
      messages: [{ role: "user", content: "hi" }],
      systemPrompt: "z".repeat(8000),
      maxTokens: 256,
      limits,
    });
    expect(withSystem.estimatedPromptTokens).toBeGreaterThan(without.estimatedPromptTokens);
  });

  it("offers an affordable token count in the rejection message", () => {
    const result = validateContextBudget({
      messages: [{ role: "user", content: "y".repeat(9500) }],
      maxTokens: 512,
      limits,
    });
    expect(result.ok).toBe(false);
    if (result.reason === BUDGET_REASON.BUDGET_EXCEEDED) {
      expect(result.detail).toMatch(/max output tokens to ~\d+/);
    }
  });
});

describe("presets", () => {
  it("offers only presets inside the ceiling", () => {
    for (const preset of DEPLOYMENT_LIMITS.presets) {
      expect(preset).toBeLessThanOrEqual(DEPLOYMENT_LIMITS.maxOutputTokensCeiling);
    }
  });
});
