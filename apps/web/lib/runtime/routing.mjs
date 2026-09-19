/**
 * Conversation -> runtime routing contract.
 *
 * WHY THIS EXISTS
 * ---------------
 * Model selection used to be cosmetic: the Playground created every conversation
 * with `providerId: null, modelId: null` and the chat view unconditionally sent
 * the GHARIBO-V1 sentinel on every request, so every conversation silently routed
 * to GHARIBO-V1 no matter what the model dropdown showed.
 *
 * This module is the single, pure authority for the decision "where does this
 * conversation's next message go?". It is deliberately free of I/O so the routing
 * rules can be unit-tested directly, and so the server route and the client UI
 * cannot disagree about what a selection means.
 *
 * SCHEMA INVARIANT
 * ----------------
 * `conversations.provider_id` carries a FOREIGN KEY to `providers(id)` with
 * `foreign_keys = ON`. The V1 runtime is addressed purely by environment
 * (`GHARIBO_V1_BASE_URL`) and has NO providers row, so its sentinel MUST NEVER be
 * written into `provider_id` — doing so raises a constraint violation. The
 * sentinel may only ever be a WIRE value on a request, never a stored one.
 *
 * The stored representation of "this conversation talks to GHARIBO-V1" is
 * therefore `provider_id = NULL, model_id = "GHARIBO-V1"`.
 */

import { V1_MODEL_ID, V1_RUNTIME_PROVIDER_ID } from "./gharibo-v1.mjs";

/** The kinds of destination a conversation message can be routed to. */
export const ROUTE_KIND = Object.freeze({
  /** The GHARIBO-V1 runtime, addressed by environment configuration. */
  V1: "v1",
  /** A real `providers` row, addressed by its primary key. */
  PROVIDER: "provider",
  /** Nothing is configured, or the conversation is not addressable. */
  UNCONFIGURED: "unconfigured",
});

/** Machine-readable reasons, so failures can be explained without guessing. */
export const ROUTE_REASON = Object.freeze({
  EXPLICIT_PROVIDER: "EXPLICIT_PROVIDER",
  PROVIDER_ENDPOINT_IS_V1: "PROVIDER_ENDPOINT_IS_V1",
  V1_SENTINEL_PROVIDER: "V1_SENTINEL_PROVIDER",
  V1_MODEL_IDENTITY: "V1_MODEL_IDENTITY",
  REQUEST_V1_SENTINEL: "REQUEST_V1_SENTINEL",
  NO_ROUTE: "NO_ROUTE",
});

/** True when `value` is the GHARIBO-V1 runtime sentinel. */
export function isV1Sentinel(value) {
  return typeof value === "string" && value === V1_RUNTIME_PROVIDER_ID;
}

/**
 * Normalises a base URL for identity comparison.
 *
 * Scheme/host are case-insensitive, but URL paths are not. Lower-casing the
 * entire string can collapse two distinct case-sensitive endpoints and route an
 * ordinary provider through the GHARIBO-V1 contract by mistake.
 */
export function normalizeBaseUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/+$/, "");
  if (trimmed.length === 0) return null;

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${url.protocol.toLowerCase()}//${url.host.toLowerCase()}${pathname}${url.search}`;
  } catch {
    // Keep invalid/non-standard values comparable without changing
    // case-sensitive path-like content.
    return trimmed;
  }
}

/**
 * True when a provider row addresses the same endpoint as the V1 runtime.
 *
 * Routing by ENDPOINT IDENTITY means a user who adds the V1 endpoint as an
 * ordinary provider still gets the Harmony final-channel guard — the guard
 * follows the endpoint, not the label.
 */
export function isV1Endpoint(providerBaseUrl, v1BaseUrl) {
  const a = normalizeBaseUrl(providerBaseUrl);
  const b = normalizeBaseUrl(v1BaseUrl);
  return a !== null && b !== null && a === b;
}

/**
 * Resolves the destination for a conversation's next message.
 *
 * @param {{
 *   providerId?: string | null,
 *   modelId?: string | null,
 *   providerBaseUrl?: string | null,
 *   requestRuntimeProviderId?: string | null,
 *   v1BaseUrl?: string | null,
 * }} input
 * @returns {{ kind: string, providerId: string | null, modelId: string | null, reason: string }}
 */
export function resolveConversationRoute(input = {}) {
  const providerId = normalizeId(input.providerId);
  const modelId = normalizeId(input.modelId);
  const requestSentinel = input.requestRuntimeProviderId;

  // 1. A real provider row wins — unless that row points at the V1 endpoint, in
  //    which case the V1 contract (Harmony guard) must still apply.
  if (providerId && !isV1Sentinel(providerId)) {
    if (isV1Endpoint(input.providerBaseUrl, input.v1BaseUrl)) {
      return {
        kind: ROUTE_KIND.V1,
        providerId,
        modelId: V1_MODEL_ID,
        reason: ROUTE_REASON.PROVIDER_ENDPOINT_IS_V1,
      };
    }
    return {
      kind: ROUTE_KIND.PROVIDER,
      providerId,
      modelId,
      reason: ROUTE_REASON.EXPLICIT_PROVIDER,
    };
  }

  // 2. Defensive: a legacy row may carry the sentinel in provider_id. It is
  //    still routed correctly, and the write path no longer produces this shape.
  if (isV1Sentinel(providerId)) {
    return {
      kind: ROUTE_KIND.V1,
      providerId: null,
      modelId: V1_MODEL_ID,
      reason: ROUTE_REASON.V1_SENTINEL_PROVIDER,
    };
  }

  // 3. The stored V1 representation: provider_id NULL + model identity.
  if (modelId === V1_MODEL_ID) {
    return {
      kind: ROUTE_KIND.V1,
      providerId: null,
      modelId: V1_MODEL_ID,
      reason: ROUTE_REASON.V1_MODEL_IDENTITY,
    };
  }

  // 4. Backwards compatibility for conversations created before this contract
  //    existed (both columns NULL): honour an explicit per-request sentinel.
  if (isV1Sentinel(requestSentinel)) {
    return {
      kind: ROUTE_KIND.V1,
      providerId: null,
      modelId: V1_MODEL_ID,
      reason: ROUTE_REASON.REQUEST_V1_SENTINEL,
    };
  }

  return {
    kind: ROUTE_KIND.UNCONFIGURED,
    providerId: null,
    modelId: null,
    reason: ROUTE_REASON.NO_ROUTE,
  };
}

/**
 * Converts a UI model-selection key into the PERSISTED conversation target.
 *
 * This is the only sanctioned way to turn a dropdown choice into stored columns,
 * and it is why the sentinel can never reach `provider_id`.
 *
 * @param {string | null} selectionKey `V1_RUNTIME_PROVIDER_ID` or a provider row id.
 * @param {{ modelId?: string | null } | null} [providerRow] The selected provider row, when any.
 * @returns {{ providerId: string | null, modelId: string | null }}
 */
export function targetFromSelection(selectionKey, providerRow = null) {
  if (isV1Sentinel(selectionKey)) {
    return { providerId: null, modelId: V1_MODEL_ID };
  }
  if (typeof selectionKey === "string" && selectionKey.trim().length > 0) {
    return {
      providerId: selectionKey.trim(),
      modelId: normalizeId(providerRow?.modelId),
    };
  }
  return { providerId: null, modelId: null };
}

function normalizeId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
