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

/**
 * The provider id the UI uses to address the GHARIBO V1 runtime through the
 * environment. It is a SENTINEL, not a row in the `providers` table: the runtime
 * is addressed purely by `GHARIBO_V1_BASE_URL`, so no DB provider, no stored
 * base URL and no stored credential are ever required to use V1. A conversation
 * may carry this id as `providerId`; the message route special-cases it.
 */
export const V1_RUNTIME_PROVIDER_ID = "gharibo-v1-runtime";

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
  /**
   * Health probe timeout.
   *
   * Deliberately longer than the old 5 s (which reported a cold-starting GPU
   * container as OFFLINE) but short enough that the UI gets an answer quickly.
   * The key point is not the duration but the CLASSIFICATION: a probe that does
   * not answer in time is reported as WARMING (unknown, possibly starting),
   * never as a definitive failure. Aborting early costs nothing extra — the
   * container boots whether or not this socket stays open.
   */
  healthTimeoutMs: 8_000,
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
  /** The endpoint answered, but the model is still loading. Not a failure. */
  WARMING: "WARMING",
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  UNAUTHORIZED: "UNAUTHORIZED",
  ERROR: "ERROR",
});

/**
 * Performs a REAL probe against the runtime.
 *
 * Probe order:
 *   1. `GET {base}/health` — the GHARIBO serving service's own endpoint. It
 *      reports `loading | ready | unhealthy` plus GPU/adapter diagnostics, which
 *      lets a cold-starting container be reported as WARMING rather than OFFLINE.
 *   2. `GET {base}/v1/models` — the OpenAI-compatible fallback, used when the
 *      endpoint is a generic OpenAI-compatible server with no `/health`.
 *
 * ONLINE is returned only when the endpoint actually answered. Configuration
 * alone is never reported as ready, and an unanswered probe is reported as
 * WARMING (unknown / possibly starting) rather than as a definitive failure —
 * a GPU container that is still booting is not "offline".
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

  const base = config.baseUrl.replace(/\/+$/, "");
  const headers = {};
  if (deps.token) headers.Authorization = `Bearer ${deps.token}`;

  /** Single timed GET. Distinguishes "no answer in time" from "refused". */
  async function probe(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      return { response, timedOut: false, error: null };
    } catch (error) {
      const timedOut = error?.name === "AbortError" || error?.code === "ABORT_ERR";
      return { response: null, timedOut, error };
    } finally {
      clearTimeout(timer);
    }
  }

  // ---- 1. Rich health endpoint -------------------------------------------
  const healthProbe = await probe(`${base}/health`);

  if (healthProbe.response) {
    const { response } = healthProbe;

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

    if (response.status === 404) {
      // Not a GHARIBO serving instance; fall through to the OpenAI-compatible probe.
    } else if (response.ok) {
      const body = await response.json().catch(() => null);
      const status = typeof body?.status === "string" ? body.status : null;
      const diagnostics = summarizeDiagnostics(body);

      if (status === "ready") {
        return {
          state: V1_HEALTH.ONLINE,
          ok: true,
          detail: "Runtime reported ready.",
          checkedAt,
          modelId: body?.model_id ?? config.modelId,
          statusCode: response.status,
          diagnostics,
        };
      }

      if (status === "loading") {
        return {
          state: V1_HEALTH.WARMING,
          ok: false,
          detail: "Runtime is up and still loading the model.",
          checkedAt,
          modelId: body?.model_id ?? config.modelId,
          statusCode: response.status,
          diagnostics,
        };
      }

      if (status === "unhealthy") {
        return {
          state: V1_HEALTH.ERROR,
          ok: false,
          detail: body?.error
            ? `Runtime reported unhealthy: ${String(body.error).slice(0, 200)}`
            : "Runtime reported unhealthy.",
          checkedAt,
          modelId: body?.model_id ?? config.modelId,
          statusCode: response.status,
          diagnostics,
        };
      }

      // A 2xx /health with an unrecognised shape: treat as reachable.
      return {
        state: V1_HEALTH.ONLINE,
        ok: true,
        detail: "Runtime answered the health probe.",
        checkedAt,
        modelId: body?.model_id ?? config.modelId,
        statusCode: response.status,
        diagnostics,
      };
    } else if (response.status >= 500) {
      // A 5xx from /health can mean the container is up but the engine failed.
      return {
        state: V1_HEALTH.OFFLINE,
        ok: false,
        detail: `Runtime health probe failed with HTTP ${response.status}.`,
        checkedAt,
        modelId: config.modelId,
        statusCode: response.status,
      };
    }
  } else if (healthProbe.timedOut) {
    // No answer in time. A GPU container may still be cold-starting, so this is
    // reported honestly as "unknown / possibly warming", never as "offline".
    return {
      state: V1_HEALTH.WARMING,
      ok: false,
      detail:
        `No response within ${Math.round(timeoutMs / 1000)}s. The runtime may be ` +
        "cold-starting, which can take several minutes on a scaled-to-zero GPU.",
      checkedAt,
      modelId: config.modelId,
    };
  }

  // ---- 2. OpenAI-compatible fallback -------------------------------------
  const modelsProbe = await probe(`${base}/v1/models`);

  if (!modelsProbe.response) {
    if (modelsProbe.timedOut) {
      return {
        state: V1_HEALTH.WARMING,
        ok: false,
        detail: `No response within ${Math.round(timeoutMs / 1000)}s; the runtime may be starting.`,
        checkedAt,
        modelId: config.modelId,
      };
    }
    return {
      state: V1_HEALTH.OFFLINE,
      ok: false,
      detail: `Runtime unreachable: ${
        modelsProbe.error instanceof Error ? modelsProbe.error.message : String(modelsProbe.error)
      }`,
      checkedAt,
      modelId: config.modelId,
    };
  }

  const response = modelsProbe.response;

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
}

/**
 * Extracts the client-safe diagnostic subset of a `/health` body.
 *
 * Only real reported values are kept; anything absent stays null so the UI can
 * say "unavailable" instead of inventing a number.
 *
 * @param {any} body
 */
function summarizeDiagnostics(body) {
  const d = body?.diagnostics;
  if (!d || typeof d !== "object") return null;
  return {
    cudaAvailable: d.cuda_available === true,
    gpuName: typeof d.gpu_name === "string" ? d.gpu_name : null,
    vramTotalBytes: typeof d.vram_total_bytes === "number" ? d.vram_total_bytes : null,
    vramAllocatedBytes: typeof d.vram_allocated_bytes === "number" ? d.vram_allocated_bytes : null,
    adapterLoaded: d.adapter_loaded === true,
    adapterSha256Verified: d.adapter_sha256_verified === true,
    baseModelLoaded: d.base_model_loaded === true,
  };
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
// End-to-end chat (the contract the application route drives)
// ---------------------------------------------------------------------------

/**
 * Performs a REAL inference call against the V1 runtime and returns only the
 * final-channel answer. This is the single function the application route calls
 * for V1; it reuses the canonical request builder, the server-side token
 * resolver and the final-channel guard so the inference prompt can never drift
 * from the training prompt and `analysis` can never leave this module.
 *
 * It talks OpenAI-compatible HTTP to `config.baseUrl`. A non-2xx or a network
 * failure throws — it never invents an answer. Malformed / no-final-channel
 * responses are returned as `{ ok: false }` and are handled by the caller
 * (which fails closed rather than surfacing raw model text).
 *
 * @param {{
 *   config: ReturnType<typeof resolveV1RuntimeConfig>,
 *   token: string | null,
 *   messages: Array<{role: string, content: string}>,
 *   options?: { systemPrompt?: string, temperature?: number, maxTokens?: number },
 *   fetchImpl?: typeof fetch,
 * }} args
 * @returns {Promise<ReturnType<typeof extractV1Answer>>}
 */
export async function runV1Chat({
  config,
  token,
  messages,
  options = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = V1_DEFAULTS.timeoutMs,
}) {
  if (!config?.configured || !config.baseUrl) {
    throw new Error("GHARIBO V1 runtime is not configured");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation available for the V1 runtime");
  }

  const url = `${config.baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  // `buildV1Request` owns the prompt contract; the endpoint still requires the
  // model id on the wire, which is identity (config.modelId), not prompt.
  const body = { model: config.modelId, ...buildV1Request(messages, options) };
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  /*
   * The inference call gets its OWN abort signal.
   *
   * Next.js propagates the incoming request's abort signal to `fetch` calls made
   * inside a route handler. Without an explicit signal, a client that navigated
   * away (or hit Cancel) aborted the UPSTREAM inference too — so the answer was
   * thrown away even though the GPU had already produced it. Owning the signal
   * decouples the generation from the caller's connection: the request can still
   * complete and be persisted, and the upstream call is bounded by an explicit
   * timeout instead of by whatever the browser happens to do.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `GHARIBO V1 runtime error HTTP ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    const json = await response.json();
    return extractV1Answer(json);
  } finally {
    clearTimeout(timer);
  }
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
    // `hostingLabel` describes WHERE the runtime is hosted, not whether it is
    // healthy. A configured, self-hosted endpoint is a development runtime even
    // while it is still warming up; reporting NO_RUNTIME next to a WARMING
    // status would contradict itself.
    hostingLabel: config?.configured ? "DEVELOPMENT_EPHEMERAL_RUNTIME" : "NO_RUNTIME",
    isProduction: false,
    health: {
      state: health.state,
      ok: health.ok,
      detail: health.detail,
      checkedAt: health.checkedAt,
      statusCode: health.statusCode ?? null,
    },
    endpointHost: host,
    config: redactRuntimeConfig(config),
    // Real values reported by the serving process, or null. Never invented.
    diagnostics: health.diagnostics ?? null,
  };
}
