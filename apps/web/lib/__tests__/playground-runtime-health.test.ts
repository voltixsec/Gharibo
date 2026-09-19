/**
 * GHARIBO-V1 runtime health contract.
 *
 * The previous probe hit `/v1/models` with a 5-second timeout. Two defects:
 *   1. the GHARIBO serving service never implemented `/v1/models`, so a healthy
 *      runtime was reported OFFLINE;
 *   2. a Modal GPU cold start takes far longer than 5 seconds, so a
 *      healthy-but-starting container was reported OFFLINE.
 *
 * The contract under test:
 *   - `/health` is probed first and yields rich, truthful state;
 *   - `loading` is reported as WARMING, never as a failure;
 *   - a probe that does not answer in time is WARMING, not OFFLINE;
 *   - a genuinely refused connection is OFFLINE;
 *   - no secret material ever reaches the client descriptor.
 */
import { describe, it, expect } from "vitest";
import {
  checkV1Health,
  describeV1Runtime,
  resolveV1RuntimeConfig,
  redactRuntimeConfig,
  V1_HEALTH,
  V1_DEFAULTS,
} from "@/lib/runtime/gharibo-v1.mjs";

const BASE = "https://gharibo-v1--serve.modal.run";

function config(overrides: Record<string, string | undefined> = {}) {
  return resolveV1RuntimeConfig({
    GHARIBO_V1_BASE_URL: BASE,
    GHARIBO_V1_API_KEY_REF: "GHARIBO_V1_API_KEY",
    ...overrides,
  });
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A fetch stub that routes by path. */
function routedFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return (async (url: string) => {
    for (const [path, handler] of Object.entries(routes)) {
      if (String(url).endsWith(path)) return handler();
    }
    return jsonResponse({ error: "not found" }, 404);
  }) as unknown as typeof fetch;
}

function abortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

describe("checkV1Health — configuration", () => {
  it("reports UNCONFIGURED when nothing is set", async () => {
    const health = await checkV1Health(resolveV1RuntimeConfig({}));
    expect(health.state).toBe(V1_HEALTH.UNCONFIGURED);
    expect(health.ok).toBe(false);
  });
});

describe("checkV1Health — /health probing", () => {
  it("reports ONLINE and real diagnostics when the runtime is ready", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({
        "/health": () =>
          jsonResponse({
            status: "ready",
            model_id: "GHARIBO-V1",
            diagnostics: {
              cuda_available: true,
              gpu_name: "Tesla T4",
              vram_total_bytes: 15_637_512_192,
              vram_allocated_bytes: 12_450_000_000,
              adapter_loaded: true,
              adapter_sha256_verified: true,
              base_model_loaded: true,
            },
          }),
      }),
    });

    expect(health.state).toBe(V1_HEALTH.ONLINE);
    expect(health.ok).toBe(true);
    expect(health.diagnostics?.gpuName).toBe("Tesla T4");
    expect(health.diagnostics?.vramTotalBytes).toBe(15_637_512_192);
    expect(health.diagnostics?.adapterSha256Verified).toBe(true);
  });

  it("reports WARMING while the model is still loading", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({
        "/health": () => jsonResponse({ status: "loading", model_id: "GHARIBO-V1" }),
      }),
    });
    expect(health.state).toBe(V1_HEALTH.WARMING);
    expect(health.ok).toBe(false);
    expect(health.detail).toMatch(/still loading/i);
  });

  it("reports ERROR when the runtime is unhealthy", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({
        "/health": () =>
          jsonResponse({ status: "unhealthy", error: "adapter SHA256 mismatch" }),
      }),
    });
    expect(health.state).toBe(V1_HEALTH.ERROR);
    expect(health.detail).toContain("adapter SHA256 mismatch");
  });

  it("reports UNAUTHORIZED on 401", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({ "/health": () => jsonResponse({}, 401) }),
    });
    expect(health.state).toBe(V1_HEALTH.UNAUTHORIZED);
  });

  it("reports OFFLINE on a 5xx from /health", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({ "/health": () => jsonResponse({}, 500) }),
    });
    expect(health.state).toBe(V1_HEALTH.OFFLINE);
  });

  it("reports WARMING, not OFFLINE, when the probe times out", async () => {
    // A cold-starting GPU container is not "offline".
    const health = await checkV1Health(config(), {
      fetchImpl: (async () => {
        throw abortError();
      }) as unknown as typeof fetch,
    });
    expect(health.state).toBe(V1_HEALTH.WARMING);
    expect(health.detail).toMatch(/cold-starting/i);
  });

  it("uses a probe timeout that is longer than the old 5s default", () => {
    // The old 5 s timeout reported a cold-starting container as OFFLINE.
    expect(V1_DEFAULTS.healthTimeoutMs).toBeGreaterThan(5_000);
  });
});

describe("checkV1Health — OpenAI-compatible fallback", () => {
  it("falls back to /v1/models when /health is absent", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({
        "/health": () => jsonResponse({}, 404),
        "/v1/models": () => jsonResponse({ object: "list", data: [{ id: "GHARIBO-V1" }] }),
      }),
    });
    expect(health.state).toBe(V1_HEALTH.ONLINE);
    expect(health.ok).toBe(true);
    expect(health.detail).toMatch(/models probe/i);
  });

  it("reports UNAUTHORIZED from the fallback probe", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({
        "/health": () => jsonResponse({}, 404),
        "/v1/models": () => jsonResponse({}, 403),
      }),
    });
    expect(health.state).toBe(V1_HEALTH.UNAUTHORIZED);
  });

  it("reports OFFLINE when the endpoint refuses the connection", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    expect(health.state).toBe(V1_HEALTH.OFFLINE);
    expect(health.detail).toContain("ECONNREFUSED");
  });

  it("reports OFFLINE when both probes 404", async () => {
    const health = await checkV1Health(config(), {
      fetchImpl: routedFetch({ "/health": () => jsonResponse({}, 404), "/v1/models": () => jsonResponse({}, 404) }),
    });
    expect(health.state).toBe(V1_HEALTH.OFFLINE);
  });
});

describe("secret safety", () => {
  it("never embeds a literal credential in the configuration", () => {
    expect(() =>
      resolveV1RuntimeConfig({
        GHARIBO_V1_BASE_URL: BASE,
        // A literal token in the REF slot is rejected outright.
        GHARIBO_V1_API_KEY_REF: "sk-live-abc123",
      }),
    ).toThrow(/must be an environment variable NAME/i);
  });

  it("redacted config exposes only the variable NAME, never a value", () => {
    const redacted = redactRuntimeConfig(config());
    expect(redacted.hasCredentialReference).toBe(true);
    expect(redacted.baseUrlHost).toBe("gharibo-v1--serve.modal.run");
    // The shape carries no credential value.
    expect(JSON.stringify(redacted)).not.toMatch(/sk-|Bearer|api[_-]?key"?\s*:\s*"[^G]/i);
  });

  it("the runtime descriptor carries no secret material", async () => {
    const descriptor = await describeV1Runtime(config(), {
      token: "super-secret-token",
      fetchImpl: routedFetch({
        "/health": () => jsonResponse({ status: "ready", model_id: "GHARIBO-V1" }),
      }),
    });

    const serialised = JSON.stringify(descriptor);
    expect(serialised).not.toContain("super-secret-token");
    expect(serialised).not.toContain("Bearer");
    expect(descriptor.isProduction).toBe(false);
    expect(descriptor.hostingLabel).toBe("DEVELOPMENT_EPHEMERAL_RUNTIME");
  });

  it("sends the credential on the probe but never returns it", async () => {
    let sawAuth = false;
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      sawAuth = headers.Authorization === "Bearer tok";
      return jsonResponse({ status: "ready" });
    }) as unknown as typeof fetch;

    await checkV1Health(config(), { token: "tok", fetchImpl });
    expect(sawAuth).toBe(true);
  });

  it("describes hosting honestly while the runtime is still warming", async () => {
    // `hostingLabel` describes WHERE the runtime runs, not whether it is ready.
    // Reporting NO_RUNTIME alongside a WARMING status would contradict itself.
    const descriptor = await describeV1Runtime(config(), {
      fetchImpl: routedFetch({ "/health": () => jsonResponse({ status: "loading" }) }),
    });
    expect(descriptor.health.state).toBe(V1_HEALTH.WARMING);
    expect(descriptor.hostingLabel).toBe("DEVELOPMENT_EPHEMERAL_RUNTIME");
    expect(descriptor.isProduction).toBe(false);
  });

  it("reports NO_RUNTIME only when nothing is configured", async () => {
    const descriptor = await describeV1Runtime(resolveV1RuntimeConfig({}), {
      fetchImpl: (async () => {
        throw new Error("must not be called");
      }) as unknown as typeof fetch,
    });
    expect(descriptor.hostingLabel).toBe("NO_RUNTIME");
  });
});
