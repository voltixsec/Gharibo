export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string | null;
  rank: number;
  provider: string;
  observedAt: string;
}

export interface WebSearchProvider {
  readonly providerName: string;
  search(query: string, options?: { limit?: number; timeoutMs?: number }): Promise<WebSearchResult[]>;
}

export class SearchProviderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SearchProviderError";
  }
}

export class TavilySearchProvider implements WebSearchProvider {
  readonly providerName = "tavily";

  constructor(
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly endpoint = "https://api.tavily.com/search",
  ) {
    if (!apiKey) throw new SearchProviderError("SEARCH_PROVIDER_UNAVAILABLE", "Tavily Search is not configured");
  }

  async search(query: string, options: { limit?: number; timeoutMs?: number } = {}): Promise<WebSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) throw new SearchProviderError("SEARCH_QUERY_REQUIRED", "A non-empty search query is required");
    const limit = Math.max(1, Math.min(10, options.limit ?? 8));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);

    try {
      const response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: this.apiKey,
          query: trimmed,
          search_depth: "basic",
          topic: "general",
          max_results: limit,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
        }),
        signal: controller.signal,
      });

      if (response.status === 429) throw new SearchProviderError("SEARCH_RATE_LIMITED", "Search provider rate limit reached");
      if (!response.ok) throw new SearchProviderError("SEARCH_PROVIDER_UNAVAILABLE", `Search provider returned HTTP ${response.status}`);
      const payload = await response.json() as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const observedAt = new Date().toISOString();
      return (payload.results ?? [])
        .filter((item) => item.title && item.url && isPublicHttpUrl(item.url))
        .slice(0, limit)
        .map((item, index) => ({
          title: item.title!,
          url: canonicalUrl(item.url!),
          snippet: item.content?.trim() || null,
          rank: index + 1,
          provider: this.providerName,
          observedAt,
        }));
    } catch (error) {
      if (error instanceof SearchProviderError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new SearchProviderError("SEARCH_TIMEOUT", "Search provider request timed out");
      }
      throw new SearchProviderError("SEARCH_PROVIDER_UNAVAILABLE", "Search provider request failed");
    } finally {
      clearTimeout(timer);
    }
  }
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function canonicalUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "gclid" || key === "fbclid") url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export function resolveWebSearchProvider(
  environment: Record<string, string | undefined> = process.env,
  fetchFn: typeof fetch = fetch,
): WebSearchProvider | null {
  const configured = environment.GHARIBO_RESEARCH_PROVIDER?.trim().toLowerCase();
  const key = environment.GHARIBO_TAVILY_API_KEY || environment.TAVILY_API_KEY;
  if ((configured === "tavily" || (!configured && key)) && key) {
    return new TavilySearchProvider(key, fetchFn);
  }
  return null;
}
