/**
 * Shared synthetic regression fixtures for Harmony final-channel extraction.
 *
 * One source of truth, consumed by BOTH:
 *   - the vitest suite (`lib/__tests__/exp002-harmony-final.test.ts`), and
 *   - the EXP-002 preflight builder (`scripts/exp002/build-exp002-preflight.mjs`),
 *     which must report a deterministic extraction regression as a hard gate.
 *
 * All fixtures are synthetic. No governed dataset content appears here.
 */

const ANALYSIS = "Compare the payload against the taxonomy before answering.";
const ANSWER = '{"entityType":"SYSTEM","externalKey":"system:security:sip-voip-intercom"}';

/** The canonical shape the governed template produces for a trained answer. */
export const TRAINED_SHAPE =
  `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>` +
  `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`;

/** The synthetic analysis string, exported so tests can assert it never leaks. */
export const SYNTHETIC_ANALYSIS = ANALYSIS;
export const SYNTHETIC_ANSWER = ANSWER;

/**
 * Each case asserts: the extraction verdict, and — when a final answer is
 * expected — the exact expected answer.
 *
 * `expect.final` is the ONLY content the application is allowed to surface.
 * `expect.leaksAnalysis: false` is asserted on every case.
 */
export const REGRESSION_CASES = Object.freeze([
  {
    id: "trained-shape-analysis-then-final",
    input: TRAINED_SHAPE,
    expect: {
      ok: true,
      final: ANSWER,
      terminator: "<|return|>",
      analysisPresent: true,
      channelsFound: ["analysis", "final"],
    },
  },
  {
    id: "final-only-with-start-marker",
    input: `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`,
    expect: { ok: true, final: ANSWER, terminator: "<|return|>", analysisPresent: false },
  },
  {
    id: "final-only-bare",
    input: `<|channel|>final<|message|>${ANSWER}<|return|>`,
    expect: { ok: true, final: ANSWER, terminator: "<|return|>", analysisPresent: false },
  },
  {
    id: "final-terminated-by-end",
    input: `<|channel|>final<|message|>${ANSWER}<|end|>`,
    expect: { ok: true, final: ANSWER, terminator: "<|end|>", analysisPresent: false },
  },
  {
    id: "final-restated-takes-last",
    input:
      `<|channel|>final<|message|>first<|end|>` +
      `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`,
    expect: { ok: true, final: ANSWER, analysisPresent: false },
  },
  {
    id: "analysis-only-fails-closed",
    input: `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>`,
    expect: {
      ok: false,
      final: null,
      reason: "NO_FINAL_CHANNEL",
      analysisPresent: true,
    },
  },
  {
    id: "no-channel-header-fails-closed",
    input: ANSWER,
    expect: { ok: false, final: null, reason: "NO_CHANNEL_HEADER" },
  },
  {
    id: "empty-input-fails-closed",
    input: "",
    expect: { ok: false, final: null, reason: "EMPTY_INPUT" },
  },
  {
    id: "empty-final-channel-fails-closed",
    input: "<|channel|>final<|message|><|return|>",
    expect: { ok: false, final: null, reason: "EMPTY_FINAL_CHANNEL" },
  },
  {
    id: "commentary-not-an-answer",
    input: "<|channel|>commentary<|message|>tool call here<|call|>",
    expect: { ok: false, final: null, reason: "NO_FINAL_CHANNEL" },
  },
  {
    id: "pretty-json-preserved-byte-for-byte",
    input: '<|channel|>final<|message|>{\n  "a": 1,\n  "b": [2, 3]\n}<|return|>',
    expect: { ok: true, final: '{\n  "a": 1,\n  "b": [2, 3]\n}' },
  },
  {
    id: "angle-bracket-inside-answer-preserved",
    input: '<|channel|>final<|message|>{"note":"value <|not-a-token|> kept"}<|return|>',
    expect: { ok: true, final: '{"note":"value <|not-a-token|> kept"}' },
  },
  {
    id: "non-string-input-fails-closed",
    input: null,
    expect: { ok: false, final: null, reason: "EMPTY_INPUT" },
  },
]);

/** Cases where hidden-channel content is present and must never be surfaced. */
export const HIDDEN_CHANNEL_CASES = Object.freeze([
  { id: "analysis-then-final", input: TRAINED_SHAPE, expectHidden: true },
  { id: "analysis-only", input: `<|channel|>analysis<|message|>${ANALYSIS}<|end|>`, expectHidden: true },
  { id: "commentary", input: "<|channel|>commentary<|message|>x<|call|>", expectHidden: true },
  {
    id: "clean-final",
    input: `<|channel|>final<|message|>${ANSWER}<|return|>`,
    expectHidden: false,
  },
]);

/**
 * Runs every case against an injected extractor and returns a machine-readable
 * report. Used as the preflight's deterministic extraction regression gate.
 *
 * @param {(text: unknown) => any} extractFinalChannel
 * @param {(text: unknown) => boolean} containsHiddenChannel
 * @param {(text: unknown) => string | null} finalChannelOrNull
 */
export function runExtractionRegression(
  extractFinalChannel,
  containsHiddenChannel,
  finalChannelOrNull,
) {
  const results = [];

  for (const testCase of REGRESSION_CASES) {
    const actual = extractFinalChannel(testCase.input);
    const problems = [];

    if (actual.ok !== testCase.expect.ok) {
      problems.push(`ok: expected ${testCase.expect.ok}, got ${actual.ok}`);
    }
    if ("final" in testCase.expect && actual.final !== testCase.expect.final) {
      problems.push(`final mismatch`);
    }
    if ("reason" in testCase.expect && actual.reason !== testCase.expect.reason) {
      problems.push(`reason: expected ${testCase.expect.reason}, got ${actual.reason}`);
    }
    if ("terminator" in testCase.expect && actual.terminator !== testCase.expect.terminator) {
      problems.push(`terminator: expected ${testCase.expect.terminator}, got ${actual.terminator}`);
    }
    if (
      "analysisPresent" in testCase.expect &&
      actual.analysisPresent !== testCase.expect.analysisPresent
    ) {
      problems.push(`analysisPresent: expected ${testCase.expect.analysisPresent}`);
    }
    if ("channelsFound" in testCase.expect) {
      const a = JSON.stringify(actual.channelsFound);
      const b = JSON.stringify(testCase.expect.channelsFound);
      if (a !== b) problems.push(`channelsFound: expected ${b}, got ${a}`);
    }

    // The analysis string must never appear anywhere in the returned object.
    if (JSON.stringify(actual).includes(SYNTHETIC_ANALYSIS)) {
      problems.push("ANALYSIS LEAKED into the extraction result");
    }

    // `finalChannelOrNull` must agree with `ok`.
    const shortcut = finalChannelOrNull(testCase.input);
    const expectedShortcut = testCase.expect.ok ? testCase.expect.final : null;
    if (shortcut !== expectedShortcut) {
      problems.push("finalChannelOrNull disagrees with extractFinalChannel");
    }

    results.push({ id: testCase.id, pass: problems.length === 0, problems });
  }

  for (const hiddenCase of HIDDEN_CHANNEL_CASES) {
    const actual = containsHiddenChannel(hiddenCase.input);
    const pass = actual === hiddenCase.expectHidden;
    results.push({
      id: `hidden-channel:${hiddenCase.id}`,
      pass,
      problems: pass ? [] : [`expected ${hiddenCase.expectHidden}, got ${actual}`],
    });
  }

  // Determinism: repeated calls must be deeply equal.
  const first = extractFinalChannel(TRAINED_SHAPE);
  let deterministic = true;
  for (let i = 0; i < 25; i += 1) {
    if (JSON.stringify(extractFinalChannel(TRAINED_SHAPE)) !== JSON.stringify(first)) {
      deterministic = false;
      break;
    }
  }
  results.push({
    id: "determinism:repeated-calls",
    pass: deterministic,
    problems: deterministic ? [] : ["repeated calls returned differing results"],
  });

  const failed = results.filter((r) => !r.pass);
  return {
    pass: failed.length === 0,
    caseCount: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    failures: failed,
    results,
  };
}
