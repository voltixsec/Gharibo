/**
 * GHARIBO V1 runtime contract.
 *
 * Provider-neutral by construction. Nothing here knows about Kaggle, or about any
 * particular host: the runtime is addressed as an OpenAI-compatible HTTP endpoint
 * whose location comes from the environment. Moving the model to a different GPU
 * host changes configuration, never model identity and never UI behaviour.
 *
 * Four rules this module exists to enforce:
 *
 * 1. FINAL-CHANNEL ONLY. `analysis` is chain-of-thought. It must never be scored
 *    and must never reach a user. Every answer passes through
 *    `extractFinalChannel` before it can leave this module.
 * 2. TRUTHFUL HEALTH. `checkV1Health` performs a real network probe. It never
 *    reports ONLINE because configuration merely exists, and it never invents a
 *    ready state.
 * 3. SECRETS STAY SERVER-SIDE. The runtime token is held as an environment
 *    VARIABLE NAME. `redactRuntimeConfig` is the only shape safe to serialise.
 * 4. CANONICAL REQUEST. One builder produces the request body, so the training
 *    prompt contract and the inference prompt contract cannot drift apart.
 *
 * Plain ESM so the Next.js application and the local Node harnesses import the
 * same implementation (the pattern already used by
 * `apps/web/lib/training/gold-authorization.mjs`).
 */
import { extractFinalChannel, containsHiddenChannel } from "./harmony-final.mjs";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Canonical model identity. Independent of wherever the model happens to run. */
export const V1_MODEL_ID = "GHARIBO-V1";

/** The governed role sequence the model was trained on. */
export const V1_ROLE_SEQUENCE = "system -> user -> assistant";

/** The only Harmony channel that may become an application answer. */
export const V1_FINAL_CHANNEL = "final";

/** Environment variable names. Values are never embedded here. */
export const V1_ENV = Object.freeze({
  baseUrl: "GHARIBO_V1_BASE_URL",
  apiKeyRef: "GHARIBO_V1_API_KEY_REF",
  modelId: "GHARIBO_V1_MODEL_ID",
  apiKey: "GHARIBO_V1_API_KEY",
});

/** Default generation parameters for the canonical V1 request. */
export const V1_DEFAULTS = Object.freeze({
  temperature: 0.2,
  maxTokens: 3072,
  timeoutMs: 120_000,
  healthTimeoutMs: 5_000,
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Resolves the V1 runtime configuration from the environment.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   configured: boolean,
 *   baseUrl: string | null,
 *   modelId: string,
 *   apiKeyRef: string | null,
 *   missing: string[],
 * }}
 */
export function resolveV1RuntimeConfig(env = {}) {
  const baseUrl = (env[V1_ENV.baseUrl] ?? "").trim() || null;
  const modelId = (env[V1_ENV.modelId] ?? "").trim() || V1_MODEL_ID;

  // The token is referenced, never inlined. A literal token is rejected outright
  // so a secret cannot be smuggled into configuration by accident.
  const rawRef = (env[V1_ENV.apiKeyRef] ?? "").trim() || null;
  let apiKeyRef = rawRef;
  if (rawRef && !/^[A-Z][A-Z0-9_]*$/i.test(rawRef)) {
    throw new Error(
      "GHARIBO_V1_API_KEY_REF must be an environment variable NAME, not a value. " +
        "Refusing to accept a literal credential.",
    );
  }
  if (!apiKeyRef && (env[V1_ENV.apiKey] ?? "").trim()) {
    // Convenience: a raw key was supplied, but it is only ever carried as a name
    // so it cannot leak through any serialised config shape.
    apiKeyRef = V1_ENV.apiKey;
  }

  const missing = [];
  if (!baseUrl) missing.push(V1_ENV.baseUrl);
  if (!apiKeyRef) missing.push(V1_ENV.apiKeyRef);

  return {
    configured: missing.length === 0,
    baseUrl,
    modelId,
    apiKeyRef,
    missing,
  };
}

/**
 * A serialisable view of the runtime configuration with NO secret material.
 * This is the only shape that may cross a client boundary.
 *
 * @param {ReturnType<typeof resolveV1RuntimeConfig>} config
 */
export function redactRuntimeConfig(config) {
  return {
    configured: Boolean(config?.configured),
    baseUrlHost: hostOf(config?.baseUrl),
    modelId: config?.modelId ?? V1_MODEL_ID,
    // The NAME of the variable is not a secret; its value is never read here.
    apiKeyRef: config?.apiKeyRef ?? null,
    hasCredentialReference: Boolean(config?.apiKeyRef),
    missing: [...(config?.missing ?? [])],
  };
}

/** Host only — never a full URL with query or credentials. */
function hostOf(url) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return "<invalid-url>";
  }
}

/** Resolves the credential value server-side only. */
export function resolveRuntimeToken(config, env = {}) {
  const ref = config?.apiKeyRef;
  if (!ref) return null;
  const value = env[ref];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Canonical request
// ---------------------------------------------------------------------------

/**
 * Builds the canonical V1 inference request body.
 *
 * `systemPrompt` is carried as the first message, exactly as the governed
 * training representation does, so the inference prompt is the training prompt.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {{systemPrompt?: string, temperature?: number, maxTokens?: number}} [options]
 * @returns {Record<string, unknown>}
 */
export function buildV1Request(messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("buildV1Request requires at least one message");
  }

  const body = {
    messages: [
      ...(options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: options.temperature ?? V1_DEFAULTS.temperature,
    max_tokens: options.maxTokens ?? V1_DEFAULTS.maxTokens,
    stream: false,
  };
  return body;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/** Truthful health states. There is no "probably fine". */
export const V1_HEALTH = Object.freeze({
  UNCONFIGURED: "UNCONFIGURED",
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  UNAUTHORIZED: "UNAUTHORIZED",
  ERROR: "ERROR",
});

/**
 * Performs a REAL probe against the runtime.
 *
 * ONLINE is returned only when the endpoint answers 2xx to a models listing.
 * Configuration alone is never reported as ready.
 *
 * @param {ReturnType<typeof resolveV1RuntimeConfig>} config
 * @param {{fetchImpl?: typeof fetch, token?: string | null, timeoutMs?: number}} [deps]
 */
export async function checkV1Health(config, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const timeoutMs = deps.timeoutMs ?? V1_DEFAULTS.healthTimeoutMs;
  const checkedAt = new Date().toISOString();

  if (!config?.configured || !config.baseUrl) {
    return {
      state: V1_HEALTH.UNCONFIGURED,
      ok: false,
      detail: `Runtime not configured. Missing: ${(config?.missing ?? []).join(", ") || "unknown"}`,
      checkedAt,
      modelId: config?.modelId ?? V1_MODEL_ID,
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      state: V1_HEALTH.ERROR,
      ok: false,
      detail: "No fetch implementation available for the health probe.",
      checkedAt,
      modelId: config.modelId,
    };
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/models`;
  const headers = {};
  if (deps.token) headers.Authorization = `Bearer ${deps.token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return {
        state: V1_HEALTH.UNAUTHORIZED,
        ok: false,
        detail: `Runtime reachable but rejected the credential (HTTP ${response.status}).`,
        checkedAt,
        modelId: config.modelId,
        statusCode: response.status,
      };
    }

    if (!response.ok) {
      return {
        state: V1_HEALTH.OFFLINE,
        ok: false,
        detail: `Runtime probe failed with HTTP ${response.status}.`,
        checkedAt,
        modelId: config.modelId,
        statusCode: response.status,
      };
    }

    return {
      state: V1_HEALTH.ONLINE,
      ok: true,
      detail: "Runtime answered the models probe.",
      checkedAt,
      modelId: config.modelId,
      statusCode: response.status,
    };
  } catch (error) {
    return {
      state: V1_HEALTH.OFFLINE,
      ok: false,
      detail: `Runtime unreachable: ${error instanceof Error ? error.message : String(error)}`,
      checkedAt,
      modelId: config.modelId,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Answer extraction
// ---------------------------------------------------------------------------

/** Reasons an inference response could not yield an application answer. */
export const V1_ANSWER_REASONS = Object.freeze({
  OK: "OK",
  NO_CHOICES: "NO_CHOICES",
  NO_CONTENT: "NO_CONTENT",
  NO_FINAL_CHANNEL: "NO_FINAL_CHANNEL",
  RUNTIME_ERROR: "RUNTIME_ERROR",
});

/**
 * Turns a raw OpenAI-compatible response into the ONE answer the application may
 * show. `analysis` can never be returned, on any path.
 *
 * @param {unknown} responseBody
 * @returns {{ ok: boolean, answer: string | null, reason: string, analysisPresent: boolean }}
 */
export function extractV1Answer(responseBody) {
  const base = { ok: false, answer: null, reason: V1_ANSWER_REASONS.NO_CHOICES, analysisPresent: false };

  const choices = responseBody?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return base;

  const content = choices[0]?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    return { ...base, reason: V1_ANSWER_REASONS.NO_CONTENT };
  }

  const extracted = extractFinalChannel(content);

  if (!extracted.ok) {
    // The model did not produce a final channel. The runtime may already have
    // isolated it, in which case the content is the answer verbatim — but only
    // when it carries NO hidden channel content. A raw Harmony blob that still
    // contains analysis is never surfaced.
    if (!containsHiddenChannel(content)) {
      return {
        ok: true,
        answer: content,
        reason: V1_ANSWER_REASONS.OK,
        analysisPresent: false,
      };
    }
    return {
      ok: false,
      answer: null,
      reason: V1_ANSWER_REASONS.NO_FINAL_CHANNEL,
      analysisPresent: extracted.analysisPresent,
    };
  }

  return {
    ok: true,
    answer: extracted.final,
    reason: V1_ANSWER_REASONS.OK,
    analysisPresent: extracted.analysisPresent,
  };
}

// ---------------------------------------------------------------------------
// Runtime descriptor (safe to expose to the UI)
// ---------------------------------------------------------------------------

/**
 * The descriptor the UI may render. Contains NO secret material and reports the
 * runtime honestly, including that it is a development runtime when it is one.
 *
 * @param {ReturnType<typeof resolveV1RuntimeConfig>} config
 * @param {{fetchImpl?: typeof fetch, token?: string | null}} [deps]
 */
export async function describeV1Runtime(config, deps = {}) {
  const health = await checkV1Health(config, deps);
  const host = hostOf(config?.baseUrl);

  return {
    modelId: config?.modelId ?? V1_MODEL_ID,
    roleSequence: V1_ROLE_SEQUENCE,
    finalChannel: V1_FINAL_CHANNEL,
    // Never claim production hosting. A self-hosted endpoint reached over plain
    // HTTP from a dev machine is a development runtime.
    hostingLabel: health.ok ? "DEVELOPMENT_EPHEMERAL_RUNTIME" : "NO_RUNTIME",
    isProduction: false,
    health: {
      state: health.state,
      ok: health.ok,
      detail: health.detail,
      checkedAt: health.checkedAt,
    },
    endpointHost: host,
    config: redactRuntimeConfig(config),
  };
}
