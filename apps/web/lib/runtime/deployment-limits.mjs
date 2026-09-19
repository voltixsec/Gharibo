/**
 * Deployment resource limits for the GHARIBO-V1 development runtime.
 *
 * WHY THIS IS SEPARATE FROM IDENTITY
 * ----------------------------------
 * The accepted model identity has a 3072-token context (`V1_CONTEXT_LENGTH`).
 * That is a property of the MODEL and must never change.
 *
 * The development GPU is a different matter: a Tesla T4 with ~14.56 GiB VRAM, of
 * which roughly 11.6 GiB is already resident once the 4-bit base + LoRA adapter
 * are loaded. The repository's own serving documentation states that the
 * identity-preserving deployment wants >= ~24 GB VRAM. On the T4 the remaining
 * headroom is small, and a client that asks for thousands of output tokens can
 * trigger a CUDA OOM that takes the whole worker down.
 *
 * These are therefore DEPLOYMENT constraints, not model constraints. They are
 * applied at the application boundary so that no client — UI, curl, or a
 * third-party OpenAI-compatible tool — can OOM the GPU simply by asking for a
 * large `max_tokens`.
 *
 * Every limit here is overridable by environment so a larger GPU can raise the
 * ceiling without touching model identity or prompt contract.
 */

/** Rough characters-per-token ratio for English+code. Deliberately conservative. */
const CHARS_PER_TOKEN = 3.2;

/** The model's official context identity. Not a deployment limit. */
export const V1_CONTEXT_LENGTH = 3072;

/**
 * Defaults sized for the T4 development runtime.
 *
 * `defaultMaxOutputTokens` is what the UI proposes; `maxOutputTokensCeiling` is
 * the hard server-side bound that applies even when a client asks for more.
 */
export const DEPLOYMENT_LIMITS = Object.freeze({
  defaultMaxOutputTokens: 256,
  maxOutputTokensCeiling: 512,
  /** Reserved headroom so the prompt can never consume the entire window. */
  reservedPromptTokens: 128,
  /** Safe presets offered in the UI. */
  presets: Object.freeze([64, 128, 256, 512]),
});

/** Generic presets for provider-backed models; filtered by their context window. */
const PROVIDER_PRESETS = Object.freeze([64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384]);

/** Machine-readable rejection reasons. */
export const BUDGET_REASON = Object.freeze({
  OK: "OK",
  PROMPT_TOO_LARGE: "PROMPT_TOO_LARGE",
  OUTPUT_TOO_LARGE: "OUTPUT_TOO_LARGE",
  BUDGET_EXCEEDED: "BUDGET_EXCEEDED",
  EMPTY_REQUEST: "EMPTY_REQUEST",
});

/** Reads a positive integer limit from the environment, falling back safely. */
function envInt(env, name, fallback) {
  const raw = env?.[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") return fallback;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/**
 * Resolves the effective deployment limits, allowing environment overrides.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function resolveDeploymentLimits(env = {}) {
  const ceiling = envInt(env, "GHARIBO_MAX_OUTPUT_TOKENS_CEILING", DEPLOYMENT_LIMITS.maxOutputTokensCeiling);
  const dflt = envInt(env, "GHARIBO_DEFAULT_MAX_OUTPUT_TOKENS", DEPLOYMENT_LIMITS.defaultMaxOutputTokens);
  const requestedContextLength = envInt(
    env,
    "GHARIBO_V1_CONTEXT_LENGTH",
    V1_CONTEXT_LENGTH,
  );
  // Deployment configuration may reduce the usable window, but it must never
  // claim a context larger than the accepted model identity. The backend is
  // hard-bound to V1_CONTEXT_LENGTH, so allowing an override above 3072 here
  // would make the application admit requests the model itself must reject.
  const contextLength = Math.min(requestedContextLength, V1_CONTEXT_LENGTH);

  return {
    // The default can never exceed the ceiling; a misconfiguration must not
    // produce a default that the server would then reject.
    defaultMaxOutputTokens: Math.min(dflt, ceiling),
    maxOutputTokensCeiling: ceiling,
    contextLength,
    reservedPromptTokens: DEPLOYMENT_LIMITS.reservedPromptTokens,
    presets: DEPLOYMENT_LIMITS.presets.filter((p) => p <= ceiling),
  };
}

/**
 * Builds a budget for a normal provider-backed model.
 *
 * GHARIBO's T4 ceiling is a deployment property of GHARIBO only. Reusing that
 * 512-token ceiling for OpenAI/Ollama/vLLM providers silently crippled models
 * with larger context windows. Provider conversations are instead bounded by
 * the provider row's declared context window.
 *
 * @param {unknown} contextWindow
 * @param {unknown} [defaultMaxOutputTokens]
 */
export function resolveProviderLimits(contextWindow, defaultMaxOutputTokens = 2048) {
  const parsedContext = Number.parseInt(String(contextWindow ?? ""), 10);
  const contextLength =
    Number.isFinite(parsedContext) && parsedContext > 0 ? parsedContext : 4096;
  const parsedDefault = Number.parseInt(String(defaultMaxOutputTokens ?? ""), 10);
  const requestedDefault =
    Number.isFinite(parsedDefault) && parsedDefault > 0 ? parsedDefault : 2048;

  return {
    defaultMaxOutputTokens: Math.min(requestedDefault, contextLength),
    maxOutputTokensCeiling: contextLength,
    contextLength,
    reservedPromptTokens: Math.min(
      DEPLOYMENT_LIMITS.reservedPromptTokens,
      Math.max(1, Math.floor(contextLength / 8)),
    ),
    presets: PROVIDER_PRESETS.filter((preset) => preset <= contextLength),
  };
}

/**
 * Clamps a requested output-token count into the safe deployment range.
 *
 * This never throws: a request asking for 4096 on a T4 becomes 512 and is
 * reported as clamped, so the caller can be told the truth rather than being
 * silently surprised by a shorter answer.
 *
 * @param {unknown} requested
 * @param {{ maxOutputTokensCeiling: number, defaultMaxOutputTokens: number }} limits
 * @returns {{ value: number, clamped: boolean, requested: number | null }}
 */
export function clampMaxOutputTokens(requested, limits) {
  const ceiling = limits?.maxOutputTokensCeiling ?? DEPLOYMENT_LIMITS.maxOutputTokensCeiling;
  const fallback = Math.min(
    limits?.defaultMaxOutputTokens ?? DEPLOYMENT_LIMITS.defaultMaxOutputTokens,
    ceiling,
  );

  const asNumber = typeof requested === "number" ? requested : Number(requested);
  if (!Number.isFinite(asNumber) || asNumber <= 0) {
    return { value: fallback, clamped: false, requested: null };
  }

  const floored = Math.floor(asNumber);
  if (floored > ceiling) {
    return { value: ceiling, clamped: true, requested: floored };
  }
  return { value: floored, clamped: false, requested: floored };
}

/**
 * Estimates the token count of a string without a tokenizer.
 *
 * An estimate is used deliberately: the exact tokenizer only exists on the GPU
 * host, and a preflight check that must run BEFORE the request is dispatched
 * cannot wait for it. The estimate is conservative (it rounds up) so it errs
 * toward rejecting a borderline request rather than OOMing the GPU.
 *
 * @param {unknown} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates the prompt size of a chat request.
 *
 * @param {Array<{role?: string, content?: unknown}>} messages
 * @param {string | null | undefined} [systemPrompt]
 * @returns {number}
 */
export function estimatePromptTokens(messages, systemPrompt) {
  let total = 0;
  if (typeof systemPrompt === "string") total += estimateTokens(systemPrompt);
  if (Array.isArray(messages)) {
    for (const message of messages) {
      if (!message) continue;
      const content = typeof message.content === "string" ? message.content : "";
      // ~4 tokens of per-message framing overhead.
      total += estimateTokens(content) + 4;
    }
  }
  return total;
}

/**
 * Validates a request against the deployment budget BEFORE generation.
 *
 * This is the guard that turns a would-be CUDA OOM into a structured, actionable
 * error. It runs in the application layer so the GPU worker never receives a
 * request it cannot physically serve.
 *
 * @param {{
 *   messages: Array<{role?: string, content?: unknown}>,
 *   systemPrompt?: string | null,
 *   maxTokens?: unknown,
 *   limits: ReturnType<typeof resolveDeploymentLimits>,
 * }} input
 * @returns {{
 *   ok: boolean,
 *   reason: string,
 *   maxTokens: number,
 *   clamped: boolean,
 *   requestedMaxTokens: number | null,
 *   estimatedPromptTokens: number,
 *   contextLength: number,
 *   detail: string,
 * }}
 */
export function validateContextBudget(input) {
  const limits = input?.limits ?? resolveDeploymentLimits({});
  const messages = Array.isArray(input?.messages) ? input.messages : [];

  const clamped = clampMaxOutputTokens(input?.maxTokens, limits);
  const estimatedPromptTokens = estimatePromptTokens(messages, input?.systemPrompt);

  const base = {
    maxTokens: clamped.value,
    clamped: clamped.clamped,
    requestedMaxTokens: clamped.requested,
    estimatedPromptTokens,
    contextLength: limits.contextLength,
  };

  if (messages.length === 0) {
    return {
      ...base,
      ok: false,
      reason: BUDGET_REASON.EMPTY_REQUEST,
      detail: "The request contains no messages.",
    };
  }

  // The prompt alone must fit inside the window with room reserved for output.
  const promptBudget = limits.contextLength - limits.reservedPromptTokens;
  if (estimatedPromptTokens > promptBudget) {
    return {
      ...base,
      ok: false,
      reason: BUDGET_REASON.PROMPT_TOO_LARGE,
      detail:
        `Estimated prompt size (~${estimatedPromptTokens} tokens) exceeds the ` +
        `development runtime's prompt budget (~${promptBudget} tokens of a ` +
        `${limits.contextLength}-token context). Shorten the conversation, ` +
        `start a new one, or reduce the system prompt.`,
    };
  }

  const total = estimatedPromptTokens + clamped.value;
  if (total > limits.contextLength) {
    const affordable = Math.max(1, limits.contextLength - estimatedPromptTokens);
    return {
      ...base,
      ok: false,
      reason: BUDGET_REASON.BUDGET_EXCEEDED,
      detail:
        `Prompt (~${estimatedPromptTokens} tokens) plus requested output ` +
        `(${clamped.value} tokens) exceeds the ${limits.contextLength}-token ` +
        `context. Reduce max output tokens to ~${affordable} or shorten the prompt.`,
    };
  }

  return {
    ...base,
    ok: true,
    reason: BUDGET_REASON.OK,
    detail: "Request fits the deployment budget.",
  };
}
