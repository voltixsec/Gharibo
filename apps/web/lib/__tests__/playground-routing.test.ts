/**
 * Conversation → runtime routing contract.
 *
 * These tests exist because model selection used to be cosmetic: the Playground
 * created every conversation with NULL routing columns and the chat view sent the
 * GHARIBO-V1 sentinel on every request, so every conversation silently routed to
 * GHARIBO-V1 regardless of what the model dropdown showed.
 *
 * The contract under test:
 *   1. Selecting GHARIBO-V1 routes ONLY to GHARIBO-V1.
 *   2. Selecting another provider routes to THAT provider.
 *   3. The GHARIBO-V1 sentinel is NEVER written into provider_id (it has a
 *      foreign key to providers(id) and has no row there).
 *   4. A provider row pointing at the V1 endpoint is still routed to V1, so the
 *      Harmony final-channel guard always applies.
 */
import { describe, it, expect } from "vitest";
import {
  resolveConversationRoute,
  targetFromSelection,
  isV1Sentinel,
  isV1Endpoint,
  ROUTE_KIND,
  ROUTE_REASON,
} from "@/lib/runtime/routing.mjs";
import { V1_MODEL_ID, V1_RUNTIME_PROVIDER_ID } from "@/lib/runtime/gharibo-v1.mjs";

const V1_URL = "https://gharibo-v1--serve.modal.run";

describe("targetFromSelection — the only sanctioned write path", () => {
  it("maps the V1 sentinel to providerId null + the model identity", () => {
    const target = targetFromSelection(V1_RUNTIME_PROVIDER_ID, null);
    expect(target).toEqual({ providerId: null, modelId: V1_MODEL_ID });
    // The critical invariant: the sentinel never becomes a stored provider id.
    expect(target.providerId).not.toBe(V1_RUNTIME_PROVIDER_ID);
  });

  it("maps a real provider id to that provider, carrying its model id", () => {
    const target = targetFromSelection("prov-openai-1", { modelId: "gpt-4o-mini" });
    expect(target).toEqual({ providerId: "prov-openai-1", modelId: "gpt-4o-mini" });
  });

  it("maps an empty / null selection to no route", () => {
    expect(targetFromSelection(null)).toEqual({ providerId: null, modelId: null });
    expect(targetFromSelection("   ")).toEqual({ providerId: null, modelId: null });
  });

  it("never writes the sentinel even when it is passed as a provider id", () => {
    const target = targetFromSelection(V1_RUNTIME_PROVIDER_ID, { modelId: "whatever" });
    expect(target.providerId).toBeNull();
    expect(target.modelId).toBe(V1_MODEL_ID);
  });
});

describe("resolveConversationRoute", () => {
  it("routes a stored V1 identity (providerId null + modelId GHARIBO-V1) to V1", () => {
    const route = resolveConversationRoute({
      providerId: null,
      modelId: V1_MODEL_ID,
      v1BaseUrl: V1_URL,
    });
    expect(route.kind).toBe(ROUTE_KIND.V1);
    expect(route.reason).toBe(ROUTE_REASON.V1_MODEL_IDENTITY);
    expect(route.modelId).toBe(V1_MODEL_ID);
  });

  it("routes an explicit provider to that provider, not to V1", () => {
    const route = resolveConversationRoute({
      providerId: "prov-1",
      modelId: "llama-3.1-8b",
      providerBaseUrl: "http://localhost:11434",
      v1BaseUrl: V1_URL,
    });
    expect(route.kind).toBe(ROUTE_KIND.PROVIDER);
    expect(route.providerId).toBe("prov-1");
    expect(route.modelId).toBe("llama-3.1-8b");
    expect(route.reason).toBe(ROUTE_REASON.EXPLICIT_PROVIDER);
  });

  it("routes a provider row that points at the V1 endpoint to V1", () => {
    const route = resolveConversationRoute({
      providerId: "prov-v1-endpoint",
      modelId: "GHARIBO-V1",
      providerBaseUrl: `${V1_URL}/`,
      v1BaseUrl: V1_URL,
    });
    expect(route.kind).toBe(ROUTE_KIND.V1);
    expect(route.reason).toBe(ROUTE_REASON.PROVIDER_ENDPOINT_IS_V1);
  });

  it("tolerates a legacy row that carries the sentinel in provider_id", () => {
    const route = resolveConversationRoute({
      providerId: V1_RUNTIME_PROVIDER_ID,
      modelId: null,
      v1BaseUrl: V1_URL,
    });
    expect(route.kind).toBe(ROUTE_KIND.V1);
    expect(route.providerId).toBeNull();
    expect(route.reason).toBe(ROUTE_REASON.V1_SENTINEL_PROVIDER);
  });

  it("honours a per-request sentinel only for legacy rows with no routing info", () => {
    const route = resolveConversationRoute({
      providerId: null,
      modelId: null,
      requestRuntimeProviderId: V1_RUNTIME_PROVIDER_ID,
      v1BaseUrl: V1_URL,
    });
    expect(route.kind).toBe(ROUTE_KIND.V1);
    expect(route.reason).toBe(ROUTE_REASON.REQUEST_V1_SENTINEL);
  });

  it("reports UNCONFIGURED when nothing addresses a runtime", () => {
    const route = resolveConversationRoute({ providerId: null, modelId: null });
    expect(route.kind).toBe(ROUTE_KIND.UNCONFIGURED);
    expect(route.reason).toBe(ROUTE_REASON.NO_ROUTE);
  });

  it("prefers a real provider over a stray per-request sentinel", () => {
    // A legacy client sending the sentinel must not hijack a conversation that
    // has a real provider configured.
    const route = resolveConversationRoute({
      providerId: "prov-1",
      modelId: "m",
      providerBaseUrl: "http://localhost:11434",
      requestRuntimeProviderId: V1_RUNTIME_PROVIDER_ID,
      v1BaseUrl: V1_URL,
    });
    expect(route.kind).toBe(ROUTE_KIND.PROVIDER);
    expect(route.providerId).toBe("prov-1");
  });

  it("does not treat an unconfigured V1 endpoint as a V1 route", () => {
    // With no v1BaseUrl there is nothing to match, so a provider stays a provider.
    const route = resolveConversationRoute({
      providerId: "prov-1",
      modelId: "m",
      providerBaseUrl: "https://example.com",
      v1BaseUrl: null,
    });
    expect(route.kind).toBe(ROUTE_KIND.PROVIDER);
  });
});

describe("helpers", () => {
  it("isV1Sentinel only matches the exact sentinel", () => {
    expect(isV1Sentinel(V1_RUNTIME_PROVIDER_ID)).toBe(true);
    expect(isV1Sentinel("gharibo-v1-runtime ")).toBe(false);
    expect(isV1Sentinel(null)).toBe(false);
    expect(isV1Sentinel(undefined)).toBe(false);
  });

  it("isV1Endpoint normalises host case without collapsing path case", () => {
    expect(isV1Endpoint("https://A.example.com/", "https://a.example.com")).toBe(true);
    expect(isV1Endpoint("https://a.example.com/x", "https://a.example.com")).toBe(false);
    expect(isV1Endpoint("https://a.example.com/API", "https://a.example.com/api")).toBe(false);
    expect(isV1Endpoint(null, "https://a.example.com")).toBe(false);
  });
});
