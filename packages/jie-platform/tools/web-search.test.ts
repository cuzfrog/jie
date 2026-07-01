import {
  createWebSearchProvider,
  createWebSearchTool,
  type WebSearchProvider,
} from "./web-search";
import { makeEmptyContext } from "./_test-context";

function stubProvider(results: { title: string; url: string; snippet: string }[]): WebSearchProvider {
  return { async search() { return results; } };
}

function failingProvider(message: string): WebSearchProvider {
  return { async search() { throw new Error(message); } };
}

describe("web_search", () => {
  test("max_results < 1 (including 0 and negatives) is treated as omitted (default 5)", async () => {
    const seen: number[] = [];
    const tool = createWebSearchTool({
      provider: {
        async search(_q, max) {
          seen.push(max);
          return [{ title: "t", url: "u", snippet: "s" }];
        },
      },
    });
    await tool.execute({ query: "x", maxResults: 0 }, makeEmptyContext());
    await tool.execute({ query: "y", maxResults: -1 }, makeEmptyContext());
    expect(seen).toEqual([5, 5]);
  });

  test("max_results > 20 is silently clamped to 20", async () => {
    let received: number | undefined;
    const tool = createWebSearchTool({
      provider: {
        async search(_q, max) {
          received = max;
          return [{ title: "t", url: "u", snippet: "s" }];
        },
      },
    });
    await tool.execute({ query: "x", maxResults: 100 }, makeEmptyContext());
    expect(received).toBe(20);
  });

  test("provider returns zero results -> web_search_failed: provider_returned_no_results", async () => {
    const tool = createWebSearchTool({ provider: stubProvider([]) });
    await expect(
      tool.execute({ query: "x" }, makeEmptyContext()),
    ).rejects.toMatchObject({
      code: "WEB_SEARCH_FAILED",
      message: "Web search failed: provider_returned_no_results",
    });
  });

  test("provider throws http_429 -> web_search_failed: http_429", async () => {
    const tool = createWebSearchTool({ provider: failingProvider("http_429") });
    await expect(
      tool.execute({ query: "x" }, makeEmptyContext()),
    ).rejects.toMatchObject({
      code: "WEB_SEARCH_FAILED",
      message: "Web search failed: http_429",
    });
  });

  test("provider returns results: content is numbered list", async () => {
    const tool = createWebSearchTool({
      provider: stubProvider([
        { title: "First", url: "https://a", snippet: "snip a" },
        { title: "Second", url: "https://b", snippet: "snip b" },
      ]),
    });
    const result = await tool.execute({ query: "x" }, makeEmptyContext());
    expect(result.content).toContain("1. First");
    expect(result.content).toContain("https://a");
    expect(result.content).toContain("2. Second");
  });

  test("does not end the LLM turn (terminate not set)", async () => {
    const tool = createWebSearchTool({
      provider: stubProvider([{ title: "t", url: "u", snippet: "s" }]),
    });
    const result = await tool.execute({ query: "x" }, makeEmptyContext());
    expect(result.terminate).toBeUndefined();
  });
});

describe("createWebSearchProvider", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("returns the internal DuckDuckGo-backed provider (the only way to get a default provider)", () => {
    const provider = createWebSearchProvider();
    expect(typeof provider.search).toBe("function");
  });

  test("DuckDuckGoSearchProvider is not exported: only createWebSearchProvider constructs it", async () => {
    const provider = createWebSearchProvider();
    fetchSpy.mockResolvedValue(
      new Response(
        `<a class="result__a" href="https://a">A</a>` +
          `<a class="result__snippet">snip</a>`,
        { status: 200 },
      ),
    );
    const results = await provider.search("x", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.url).toBe("https://a");
  });
});
