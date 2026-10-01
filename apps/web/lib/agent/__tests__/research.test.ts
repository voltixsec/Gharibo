import { describe, expect, it, vi } from "vitest";
import { createResearchAdapters } from "../research/adapters";
import { EvidenceFetchError, SafeWebFetcher } from "../research/safe-fetch";
import { TavilySearchProvider, type WebSearchProvider } from "../research/search-provider";

describe("GHARIBO research adapters", () => {
  it("normalizes Tavily results without exposing the API key", async () => {
    const secret = "private-test-key";
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      results: [{
        title: "Official Camera",
        url: "https://manufacturer.example/camera?utm_source=test",
        content: "Official product page",
      }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
    const provider = new TavilySearchProvider(secret, fetchFn);
    const results = await provider.search("8MP CCTV", { limit: 5, timeoutMs: 1_000 });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://manufacturer.example/camera");
    expect(JSON.stringify(results)).not.toContain(secret);
  });

  it("blocks private network destinations before HTTP fetch", async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch;
    const fetcher = new SafeWebFetcher(fetchFn, async () => ["127.0.0.1"]);

    await expect(fetcher.fetch("https://private.example/secret")).rejects.toMatchObject({
      name: "EvidenceFetchError",
      code: "FETCH_BLOCKED_URL",
    } satisfies Partial<EvidenceFetchError>);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("searches, fetches bounded source evidence, and keeps candidates unverified", async () => {
    const provider: WebSearchProvider = {
      providerName: "fixture",
      search: vi.fn(async () => [{
        title: "Official Camera",
        url: "https://manufacturer.example/camera",
        snippet: "8MP camera",
        rank: 1,
        provider: "fixture",
        observedAt: "2026-10-01T00:00:00.000Z",
      }]),
    };
    const fetcher = {
      fetch: vi.fn(async () => ({
        finalUrl: "https://manufacturer.example/camera",
        statusCode: 200,
        contentType: "text/html",
        title: "Official Camera",
        description: "Manufacturer product page",
        publisher: "Manufacturer",
        canonicalUrl: "https://manufacturer.example/camera",
        visibleText: "Official 8MP network camera specifications and product details.",
        observedAt: "2026-10-01T00:00:01.000Z",
        domain: "manufacturer.example",
        truncated: false,
        originalBytes: 512,
      })),
    } as unknown as SafeWebFetcher;

    const bundle = createResearchAdapters({}, { provider, fetcher });
    const result = await bundle.adapters.webSearch!({ query: "8MP CCTV" }) as {
      agentToolResult: true;
      data: { candidates: Array<{ verification: string }> };
      evidence: Array<{ sourceUrl: string }>;
    };

    expect(bundle.configured).toBe(true);
    expect(result.data.candidates[0]?.verification).toBe("SEARCH_CANDIDATE_ONLY");
    expect(result.evidence[0]?.sourceUrl).toBe("https://manufacturer.example/camera");
  });
});
