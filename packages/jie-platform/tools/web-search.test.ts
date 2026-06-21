import { describe, expect, test } from "bun:test";
import { createWebSearchTool, type WebSearchProvider } from "./web-search.ts";
import { JiePlatformError } from "../domain-types.ts";

function stubProvider(results: { title: string; url: string; snippet: string }[]): WebSearchProvider {
  return { async search() { return results; } };
}

function failingProvider(message: string): WebSearchProvider {
  return { async search() { throw new Error(message); } };
}

describe("web_search", () => {
  test("default max_results is 5 when omitted", async () => {
    let received: number | undefined;
    const tool = createWebSearchTool({
      provider: {
        async search(_q, max) {
          received = max;
          return [{ title: "t", url: "u", snippet: "s" }];
        },
      },
    });
    await tool.execute({ query: "x" }, {} as never);
    expect(received).toBe(5);
  });

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
    await tool.execute({ query: "x", max_results: 0 }, {} as never);
    await tool.execute({ query: "y", max_results: -1 }, {} as never);
    expect(seen).toEqual([5, 5]);
  });

  test("max_results > 20 is silently clamped to 20", async () => {
    let received: number | undefined;
    const tool = createWebSearchTool({
      provider: {
        async search(_q, max) {
          received = max;
          return [];
        },
      },
    });
    try {
      await tool.execute({ query: "x", maxResults: 100 }, {} as never);
    } catch {
    }
    expect(received).toBe(20);
  });

  test("provider returns zero results -> web_search_failed: provider_returned_no_results", async () => {
    const tool = createWebSearchTool({ provider: stubProvider([]) });
    let caught: unknown;
    try {
      await tool.execute({ query: "x" }, {} as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("web_search_failed");
    expect((caught as Error).message).toBe(
      "web_search_failed: provider_returned_no_results",
    );
  });

  test("provider throws http_429 -> web_search_failed: http_429", async () => {
    const tool = createWebSearchTool({ provider: failingProvider("http_429") });
    let caught: unknown;
    try {
      await tool.execute({ query: "x" }, {} as never);
    } catch (e) {
      caught = e;
    }
    expect((caught as JiePlatformError).code).toBe("web_search_failed");
    expect((caught as Error).message).toBe("web_search_failed: http_429");
  });

  test("provider returns results: content is numbered list", async () => {
    const tool = createWebSearchTool({
      provider: stubProvider([
        { title: "First", url: "https://a", snippet: "snip a" },
        { title: "Second", url: "https://b", snippet: "snip b" },
      ]),
    });
    const result = await tool.execute({ query: "x" }, {} as never);
    expect(result.content).toContain("1. First");
    expect(result.content).toContain("https://a");
    expect(result.content).toContain("2. Second");
  });

  test("does not end the LLM turn (terminate not set)", async () => {
    const tool = createWebSearchTool({
      provider: stubProvider([{ title: "t", url: "u", snippet: "s" }]),
    });
    const result = await tool.execute({ query: "x" }, {} as never);
    expect(result.terminate).toBeUndefined();
  });
});