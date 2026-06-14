import { Type } from "typebox";
import type { Tool, ToolResult } from "./types.ts";
import { JiePlatformError } from "../storage/domain-types.ts";

const WEB_SEARCH_DESCRIPTION = `web_search(query, max_results?): Run a web search and return up to max_results
results (default 5; max 20 — values above 20 are silently clamped). Each
result is { title, url, snippet }. The default backend scrapes DuckDuckGo
HTML (no API key required). Transient failures (HTTP 429, 5xx, network
errors, no results) surface as \`web_search_failed: <message>\`; the LLM is
not given a stack trace.`;

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  search(query: string, max_results: number): Promise<WebSearchResult[]>;
}

const DEFAULT_MAX = 5;
const HARD_MAX = 20;

export interface WebSearchDeps {
  provider: WebSearchProvider;
}

interface WebSearchInput {
  query: string;
  max_results?: number;
}

function clampMaxResults(value: number | undefined): number {
  if (value === undefined || value < 1) return DEFAULT_MAX;
  if (value > HARD_MAX) return HARD_MAX;
  return value;
}

export function createWebSearchTool(deps: WebSearchDeps): Tool<WebSearchInput> {
  return {
    name: "web_search",
    description: WEB_SEARCH_DESCRIPTION,
    label: "Web Search",
    parameters: Type.Object({
      query: Type.String(),
      max_results: Type.Optional(Type.Number()),
    }),
    async execute(input: WebSearchInput): Promise<ToolResult> {
      const max = clampMaxResults(input.max_results);
      let results: WebSearchResult[];
      try {
        results = await deps.provider.search(input.query, max);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        throw new JiePlatformError(
          "web_search_failed",
          `web_search_failed: ${message}`,
        );
      }
      if (results.length === 0) {
        throw new JiePlatformError(
          "web_search_failed",
          "web_search_failed: provider_returned_no_results",
        );
      }
      const lines = results.map(
        (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`,
      );
      return {
        content: lines.join("\n\n"),
        details: { results, query: input.query, max_results: max },
      };
    },
  };
}

/** Default provider: scrapes DuckDuckGo HTML. No API key required.
 *  The HTML layout may change; the adapter returns whatever it
 *  finds, and zero results triggers `provider_returned_no_results`
 *  per the failure-handling rule. */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  async search(query: string, max_results: number): Promise<WebSearchResult[]> {
    const url = "https://html.duckduckgo.com/html/";
    const body = new URLSearchParams({ q: query }).toString();
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "JieBot/0.1 (+https://github.com/cuzfrog/jie)",
      },
      body,
    });
    if (response.status === 429) throw new Error("http_429");
    if (response.status >= 500) throw new Error("http_5xx");
    if (!response.ok) throw new Error(`http_${response.status}`);
    const html = await response.text();
    return parseDuckDuckGoResults(html, max_results);
  }
}

function parseDuckDuckGoResults(html: string, max: number): WebSearchResult[] {
  const results: WebSearchResult[] = [];
  // DuckDuckGo HTML result blocks are .result elements. Each has:
  //  - a.result__a (the title link)
  //  - a.result__snippet (the snippet)
  // We do a lightweight regex parse to keep the dependency surface small.
  const blockPattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(html)) !== null && results.length < max) {
    const url = decodeHtmlEntities(match[1] ?? "");
    const title = stripHtml(decodeHtmlEntities(match[2] ?? ""));
    const snippet = stripHtml(decodeHtmlEntities(match[3] ?? ""));
    results.push({ title, url, snippet });
  }
  return results;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}