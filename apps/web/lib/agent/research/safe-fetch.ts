import { lookup as nodeLookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface FetchedEvidencePage {
  finalUrl: string;
  statusCode: number;
  contentType: string;
  title: string | null;
  description: string | null;
  publisher: string | null;
  canonicalUrl: string | null;
  visibleText: string;
  observedAt: string;
  domain: string;
  truncated: boolean;
  originalBytes: number;
}

export class EvidenceFetchError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "EvidenceFetchError";
  }
}

type Resolver = (hostname: string) => Promise<string[]>;

const decodeEntities = (value: string): string => value
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
  .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));

function capture(html: string, pattern: RegExp): string | null {
  const value = pattern.exec(html)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  return value ? decodeEntities(value) : null;
}

export function extractHtmlEvidence(html: string, maxVisibleTextLength = 30_000) {
  const title = capture(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const description = capture(html, /<meta\b(?=[^>]*\bname\s*=\s*["']description["'])[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i)
    ?? capture(html, /<meta\b(?=[^>]*\bcontent\s*=\s*["']([^"']*)["'])[^>]*\bname\s*=\s*["']description["'][^>]*>/i);
  const canonicalUrl = capture(html, /<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>/i);
  const publisher = capture(html, /<meta\b(?=[^>]*\b(?:name|property)\s*=\s*["'](?:publisher|og:site_name)["'])[^>]*\bcontent\s*=\s*["']([^"']*)["'][^>]*>/i);
  const cleaned = html
    .replace(/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const fullText = decodeEntities(cleaned).replace(/\s+/g, " ").trim();
  return {
    title,
    description,
    canonicalUrl,
    publisher,
    visibleText: fullText.slice(0, maxVisibleTextLength),
    truncated: fullText.length > maxVisibleTextLength,
  };
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^::ffff:/, "");
  if (value === "::1" || value === "0.0.0.0") return true;
  if (value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd")) return true;
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127);
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const result = await nodeLookup(hostname, { all: true, verbatim: true });
  return result.map((entry) => entry.address);
}

export class SafeWebFetcher {
  constructor(
    private readonly fetchFn: typeof fetch = fetch,
    private readonly resolver: Resolver = defaultResolver,
  ) {}

  private async validateUrl(value: string): Promise<URL> {
    let url: URL;
    try { url = new URL(value); }
    catch { throw new EvidenceFetchError("FETCH_BLOCKED_URL", "Invalid URL"); }
    if (!["http:", "https:"].includes(url.protocol)) throw new EvidenceFetchError("FETCH_BLOCKED_URL", "Unsupported URL protocol");
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost")) throw new EvidenceFetchError("FETCH_BLOCKED_URL", "Localhost is blocked");
    const addresses = isIP(hostname) ? [hostname] : await this.resolver(hostname);
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new EvidenceFetchError("FETCH_BLOCKED_URL", "Private or unresolved destination is blocked");
    return url;
  }

  async fetch(value: string, options: { timeoutMs?: number; maxBytes?: number; maxTextLength?: number } = {}): Promise<FetchedEvidencePage> {
    const timeoutMs = Math.max(1_000, Math.min(20_000, options.timeoutMs ?? 8_000));
    const maxBytes = Math.max(10_000, Math.min(2_000_000, options.maxBytes ?? 1_000_000));
    const maxTextLength = Math.max(1_000, Math.min(50_000, options.maxTextLength ?? 30_000));
    let current = value;

    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const url = await this.validateUrl(current);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await this.fetchFn(url, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": "GHARIBO-Agent/1.0 (+evidence-fetch)" },
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw new EvidenceFetchError("FETCH_TIMEOUT", "Evidence fetch timed out");
        throw new EvidenceFetchError("FETCH_HTTP_ERROR", "Evidence fetch failed");
      } finally {
        clearTimeout(timer);
      }

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new EvidenceFetchError("FETCH_HTTP_ERROR", "Redirect omitted Location");
        if (redirect === 3) throw new EvidenceFetchError("FETCH_REDIRECT_LIMIT", "Redirect limit reached");
        current = new URL(location, url).toString();
        continue;
      }
      if (!response.ok) throw new EvidenceFetchError("FETCH_HTTP_ERROR", `Evidence source returned HTTP ${response.status}`);
      const contentType = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
      if (!["text/html", "text/plain", "application/xhtml+xml"].includes(contentType)) {
        throw new EvidenceFetchError("FETCH_UNSUPPORTED_CONTENT", `Unsupported content type: ${contentType || "unknown"}`);
      }
      const declared = Number(response.headers.get("content-length") ?? "0");
      if (declared > maxBytes) throw new EvidenceFetchError("FETCH_TOO_LARGE", "Response exceeds byte limit");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > maxBytes) throw new EvidenceFetchError("FETCH_TOO_LARGE", "Response exceeds byte limit");
      const body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const extracted = contentType === "text/plain"
        ? {
            title: null,
            description: null,
            canonicalUrl: null,
            publisher: null,
            visibleText: body.slice(0, maxTextLength),
            truncated: body.length > maxTextLength,
          }
        : extractHtmlEvidence(body, maxTextLength);
      return {
        finalUrl: url.toString(),
        statusCode: response.status,
        contentType,
        ...extracted,
        observedAt: new Date().toISOString(),
        domain: url.hostname.toLowerCase().replace(/^www\./, ""),
        originalBytes: bytes.byteLength,
      };
    }
    throw new EvidenceFetchError("FETCH_REDIRECT_LIMIT", "Redirect limit reached");
  }
}
