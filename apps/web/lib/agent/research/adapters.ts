import { createHash } from "node:crypto";
import type { AgentEvidence } from "../contracts";
import { agentToolAdapterResult, type AgentToolAdapters } from "../tool-executor";
import { SafeWebFetcher } from "./safe-fetch";
import { resolveWebSearchProvider, type WebSearchProvider, type WebSearchResult } from "./search-provider";

export interface ResearchAdapterBundle {
  configured: boolean;
  providerName: string | null;
  adapters: AgentToolAdapters;
}

type ResearchInput = { query?: unknown };
type FetchInput = { url?: unknown };

function evidenceId(url: string): string {
  return `web-${createHash("sha256").update(url).digest("hex").slice(0, 16)}`;
}

function excerpt(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 1_500);
}

function pageEvidence(page: Awaited<ReturnType<SafeWebFetcher["fetch"]>>): AgentEvidence {
  return {
    id: evidenceId(page.finalUrl),
    sourceUrl: page.finalUrl,
    title: page.title ?? page.domain,
    excerpt: excerpt(page.visibleText),
    observedAt: page.observedAt,
    confidence: 0.65,
  };
}

function candidate(result: WebSearchResult) {
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
    rank: result.rank,
    provider: result.provider,
    observedAt: result.observedAt,
    verification: "SEARCH_CANDIDATE_ONLY" as const,
  };
}

async function searchWithEvidence(
  provider: WebSearchProvider,
  fetcher: SafeWebFetcher,
  query: string,
) {
  const results = await provider.search(query, { limit: 8, timeoutMs: 10_000 });
  const top = results.slice(0, 3);
  const fetched = await Promise.all(top.map(async (result) => {
    try {
      const page = await fetcher.fetch(result.url, { timeoutMs: 8_000, maxTextLength: 8_000 });
      return { result, page, error: null };
    } catch (error) {
      return { result, page: null, error: error instanceof Error ? error.message : "FETCH_FAILED" };
    }
  }));

  const evidence = fetched.flatMap((item) => item.page ? [pageEvidence(item.page)] : []);
  return agentToolAdapterResult({
    query,
    provider: provider.providerName,
    candidates: results.map(candidate),
    fetchedSources: fetched.filter((item) => item.page).map((item) => ({
      url: item.page!.finalUrl,
      title: item.page!.title,
      domain: item.page!.domain,
      excerpt: excerpt(item.page!.visibleText),
      observedAt: item.page!.observedAt,
      verification: "FETCHED_SOURCE_CONTENT" as const,
    })),
    unresolved: fetched.filter((item) => !item.page).map((item) => ({ url: item.result.url, error: item.error })),
    governance: { candidateOnly: true, missingFactsStayMissing: true },
  }, evidence);
}

export function createResearchAdapters(
  environment: Record<string, string | undefined> = process.env,
  options: { provider?: WebSearchProvider; fetcher?: SafeWebFetcher } = {},
): ResearchAdapterBundle {
  const provider = options.provider ?? resolveWebSearchProvider(environment);
  const fetcher = options.fetcher ?? new SafeWebFetcher();
  if (!provider) return { configured: false, providerName: null, adapters: {} };

  return {
    configured: true,
    providerName: provider.providerName,
    adapters: {
      webSearch: async (input: unknown) => {
        const query = typeof (input as ResearchInput | null)?.query === "string"
          ? (input as { query: string }).query.trim()
          : "";
        if (!query) throw new Error("WEB_SEARCH_QUERY_REQUIRED");
        return searchWithEvidence(provider, fetcher, query);
      },
      webFetch: async (input: unknown) => {
        const url = typeof (input as FetchInput | null)?.url === "string"
          ? (input as { url: string }).url.trim()
          : "";
        if (!url) throw new Error("WEB_FETCH_URL_REQUIRED");
        const page = await fetcher.fetch(url, { timeoutMs: 8_000, maxTextLength: 12_000 });
        const evidence = pageEvidence(page);
        return agentToolAdapterResult({
          url: page.finalUrl,
          title: page.title,
          description: page.description,
          publisher: page.publisher,
          domain: page.domain,
          excerpt: excerpt(page.visibleText),
          observedAt: page.observedAt,
          verification: "FETCHED_SOURCE_CONTENT" as const,
          governance: { candidateOnly: true, missingFactsStayMissing: true },
        }, [evidence]);
      },
    },
  };
}
