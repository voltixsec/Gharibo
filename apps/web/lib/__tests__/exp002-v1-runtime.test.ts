/**
 * GHARIBO V1 runtime contract — required UI/runtime integration tests.
 *
 * Covers the mandated list: provider configuration resolves, health state is
 * truthful, the request body uses the canonical V1 inference contract, a
 * final-only Harmony response is returned, the analysis channel is excluded,
 * runtime errors propagate safely, an unavailable runtime is handled, no secret
 * reaches client output, and model identity/version is correct.
 *
 * Everything here uses an injected mock transport. No GPU, no network, no
 * running server.
 */
import { describe, it, expect } from "vitest";
import {
  V1_DEFAULTS,
  V1_ENV,
  V1_HEALTH,
  V1_MODEL_ID,
  V1_ROLE_SEQUENCE,
  buildV1Request,
  checkV1Health,
  describeV1Runtime,
  extractV1Answer,
  redactRuntimeConfig,
  resolveRuntimeToken,
  resolveV1RuntimeConfig,
} from "@/lib/runtime/gharibo-v1.mjs";

const SECRET = "sk-live-DO-NOT-LEAK-0123456789";

const ANALYSIS = "Compare the payload against the taxonomy before answering.";
const ANSWER = '{"entityType":"SYSTEM","externalKey":"system:security:sip-voip-intercom"}';

/** The shape a raw Harmony runtime would return. */
const RAW_HARMONY =
  `<|start|>assistant<|channel|>analysis<|message|>${ANALYSIS}<|end|>` +
  `<|start|>assistant<|channel|>final<|message|>${ANSWER}<|return|>`;

/** A mock transport that records what it was asked to do. */
interface FetchCall {
  url: string;
  init?: RequestInit;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<unknown>) {
  const calls: FetchCall[] = [];
  // Mirrors the `typeof fetch` signature so the mock can be injected directly.
  const impl = async (
    input: URL | RequestInfo,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : String(input);
    calls.push({ url, init });
    return (await handler(url, init)) as Response;
  };
  return { impl, calls };
}

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

// ---------------------------------------------------------------- configuration

describe("V1 runtime configuration", () => {
  it("is UNCONFIGURED when nothing is set, and names what is missing", () => {
    const config = resolveV1RuntimeConfig({});

    expect(config.configured).toBe(false);
    expect(config.baseUrl).toBeNull();
    expect(config.modelId).toBe(V1_MODEL_ID);
    expect(config.missing).toContain(V1_ENV.baseUrl);
    expect(config.missing).toContain(V1_ENV.apiKeyRef);
  });

  it("resolves a full configuration from environment variable names only", () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
      [V1_ENV.modelId]: "gharibo-v1-2026-09",
    });

    expect(config.configured).toBe(true);
    expect(config.baseUrl).toBe("http://127.0.0.1:8000");
    expect(config.apiKeyRef).toBe("GHARIBO_V1_TOKEN");
    expect(config.modelId).toBe("gharibo-v1-2026-09");
    expect(config.missing).toEqual([]);
  });

  it("REFUSES a literal credential in the key-reference slot", () => {
    expect(() =>
      resolveV1RuntimeConfig({
        [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
        [V1_ENV.apiKeyRef]: SECRET,
      }),
    ).toThrow(/must be an environment variable NAME/);
  });

  it("resolves the credential server-side and returns null when absent", () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });

    expect(resolveRuntimeToken(config, { GHARIBO_V1_TOKEN: SECRET })).toBe(SECRET);
    expect(resolveRuntimeToken(config, {})).toBeNull();
  });

  it("reports the model identity independently of the hosting provider", () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://gpu-host.internal:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });

    // Moving hosts must not change identity.
    expect(config.modelId).toBe(V1_MODEL_ID);
  });
});

// ---------------------------------------------------------------- redaction

describe("secret containment", () => {
  it("never puts the credential value into the client-safe shape", () => {
    const env = {
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
      GHARIBO_V1_TOKEN: SECRET,
    };
    const config = resolveV1RuntimeConfig(env);
    const redacted = redactRuntimeConfig(config);

    expect(JSON.stringify(redacted)).not.toContain(SECRET);
    expect(redacted.apiKeyRef).toBe("GHARIBO_V1_TOKEN");
    expect(redacted.hasCredentialReference).toBe(true);
    // Only the host travels, never a full URL.
    expect(redacted.baseUrlHost).toBe("127.0.0.1:8000");
  });

  it("keeps the credential out of the runtime descriptor", async () => {
    const env = {
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
      GHARIBO_V1_TOKEN: SECRET,
    };
    const config = resolveV1RuntimeConfig(env);
    const { impl } = mockFetch(async () => jsonResponse(200, { data: [] }));

    const descriptor = await describeV1Runtime(config, { fetchImpl: impl, token: SECRET });

    expect(JSON.stringify(descriptor)).not.toContain(SECRET);
  });
});

// ---------------------------------------------------------------- health

describe("truthful runtime health", () => {
  it("is UNCONFIGURED without configuration, and never claims ready", async () => {
    const health = await checkV1Health(resolveV1RuntimeConfig({}), {
      fetchImpl: async () => {
        throw new Error("must not be called");
      },
    });

    expect(health.state).toBe(V1_HEALTH.UNCONFIGURED);
    expect(health.ok).toBe(false);
  });

  it("is ONLINE only after a real 2xx probe", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl, calls } = mockFetch(async () => jsonResponse(200, { data: [] }));

    const health = await checkV1Health(config, { fetchImpl: impl, token: SECRET });

    expect(health.state).toBe(V1_HEALTH.ONLINE);
    expect(health.ok).toBe(true);
    // The GHARIBO serving service exposes /health, which reports whether the
    // model is actually loaded. It is probed BEFORE the OpenAI-compatible
    // fallback so a cold-starting container is not misreported as offline.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://127.0.0.1:8000/health");
  });

  it("reports WARMING (never OFFLINE) while the model is still loading", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl } = mockFetch(async () => jsonResponse(200, { status: "loading" }));

    const health = await checkV1Health(config, { fetchImpl: impl });

    expect(health.state).toBe(V1_HEALTH.WARMING);
    expect(health.ok).toBe(false);
  });

  it("falls back to the models probe when /health is absent", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl, calls } = mockFetch(async (url) =>
      String(url).endsWith("/health") ? jsonResponse(404, {}) : jsonResponse(200, { data: [] }),
    );

    const health = await checkV1Health(config, { fetchImpl: impl });

    expect(health.state).toBe(V1_HEALTH.ONLINE);
    expect(calls.map((c) => c.url)).toEqual([
      "http://127.0.0.1:8000/health",
      "http://127.0.0.1:8000/v1/models",
    ]);
  });

  it("is OFFLINE when the endpoint is unreachable", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:9",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl } = mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const health = await checkV1Health(config, { fetchImpl: impl });

    expect(health.state).toBe(V1_HEALTH.OFFLINE);
    expect(health.ok).toBe(false);
    expect(health.detail).toContain("ECONNREFUSED");
  });

  it("is UNAUTHORIZED on 401 and does not report ready", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl } = mockFetch(async () => jsonResponse(401, { error: "bad key" }));

    const health = await checkV1Health(config, { fetchImpl: impl, token: "wrong" });

    expect(health.state).toBe(V1_HEALTH.UNAUTHORIZED);
    expect(health.ok).toBe(false);
  });

  it("is OFFLINE on a 5xx", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl } = mockFetch(async () => jsonResponse(503, {}));

    const health = await checkV1Health(config, { fetchImpl: impl });

    expect(health.state).toBe(V1_HEALTH.OFFLINE);
    expect(health.ok).toBe(false);
  });

  it("never labels an available runtime as production hosting", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:8000",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl } = mockFetch(async () => jsonResponse(200, { data: [] }));

    const descriptor = await describeV1Runtime(config, { fetchImpl: impl });

    expect(descriptor.isProduction).toBe(false);
    expect(descriptor.hostingLabel).toBe("DEVELOPMENT_EPHEMERAL_RUNTIME");
  });

  it("never fakes readiness for an unavailable runtime", async () => {
    const config = resolveV1RuntimeConfig({
      [V1_ENV.baseUrl]: "http://127.0.0.1:9",
      [V1_ENV.apiKeyRef]: "GHARIBO_V1_TOKEN",
    });
    const { impl } = mockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    const descriptor = await describeV1Runtime(config, { fetchImpl: impl });

    // The safeguard: an unreachable runtime is never reported as ready, and a
    // self-hosted endpoint is never dressed up as production hosting.
    expect(descriptor.health.ok).toBe(false);
    expect(descriptor.health.state).toBe(V1_HEALTH.OFFLINE);
    expect(descriptor.isProduction).toBe(false);
    // `hostingLabel` describes WHERE the runtime is hosted, not whether it is
    // reachable. The endpoint IS configured and self-hosted, so the honest
    // hosting label is the development runtime — availability is carried by
    // `health.state`/`health.ok`, which are asserted above.
    expect(descriptor.hostingLabel).toBe("DEVELOPMENT_EPHEMERAL_RUNTIME");
  });
});

// ---------------------------------------------------------------- request contract

describe("canonical V1 request", () => {
  it("puts the system prompt first, exactly as the governed representation does", () => {
    const body = buildV1Request([{ role: "user", content: "hello" }], {
      systemPrompt: "You are GHARIBO.",
    });
    const messages = body.messages as Array<{ role: string; content: string }>;

    expect(messages[0]).toEqual({ role: "system", content: "You are GHARIBO." });
    expect(messages[1]).toEqual({ role: "user", content: "hello" });
  });

  it("applies the declared defaults", () => {
    const body = buildV1Request([{ role: "user", content: "hi" }]);

    expect(body.temperature).toBe(V1_DEFAULTS.temperature);
    expect(body.max_tokens).toBe(V1_DEFAULTS.maxTokens);
    expect(body.stream).toBe(false);
  });

  it("rejects an empty message list instead of sending a malformed request", () => {
    expect(() => buildV1Request([])).toThrow(/at least one message/);
  });

  it("declares the governed role sequence and final channel", () => {
    expect(V1_ROLE_SEQUENCE).toBe("system -> user -> assistant");
    expect(V1_MODEL_ID).toBe("GHARIBO-V1");
  });
});

// ---------------------------------------------------------------- answers

describe("final-channel-only answers", () => {
  it("returns the final channel from a raw Harmony response", () => {
    const result = extractV1Answer({ choices: [{ message: { content: RAW_HARMONY } }] });

    expect(result.ok).toBe(true);
    expect(result.answer).toBe(ANSWER);
    expect(result.analysisPresent).toBe(true);
  });

  it("NEVER returns analysis content", () => {
    const result = extractV1Answer({ choices: [{ message: { content: RAW_HARMONY } }] });

    expect(result.answer).not.toContain(ANALYSIS);
    expect(JSON.stringify(result)).not.toContain(ANALYSIS);
  });

  it("passes through an already-isolated plain answer", () => {
    const result = extractV1Answer({ choices: [{ message: { content: ANSWER } }] });

    expect(result.ok).toBe(true);
    expect(result.answer).toBe(ANSWER);
    expect(result.analysisPresent).toBe(false);
  });

  it("FAILS CLOSED when only analysis is present (no raw-text fallback)", () => {
    const result = extractV1Answer({
      choices: [{ message: { content: `<|channel|>analysis<|message|>${ANALYSIS}<|end|>` } }],
    });

    expect(result.ok).toBe(false);
    expect(result.answer).toBeNull();
    expect(result.analysisPresent).toBe(true);
  });

  it("FAILS CLOSED on a response with no choices", () => {
    expect(extractV1Answer({}).ok).toBe(false);
    expect(extractV1Answer({ choices: [] }).reason).toBe("NO_CHOICES");
  });

  it("FAILS CLOSED on empty content", () => {
    expect(extractV1Answer({ choices: [{ message: { content: "" } }] }).reason).toBe("NO_CONTENT");
  });

  it("tolerates a malformed response body without throwing", () => {
    expect(extractV1Answer(null).ok).toBe(false);
    expect(extractV1Answer("not json").ok).toBe(false);
  });
});
