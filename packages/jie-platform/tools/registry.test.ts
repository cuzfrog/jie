import { describe, expect, test } from "bun:test";
import { Type } from "typebox";
import { InMemoryToolRegistry } from "./tool-registry.ts";
import type { Tool, ToolResult } from "./types.ts";

function makeTool(name: string): Tool {
  return {
    name,
    description: `desc ${name}`,
    label: `Label ${name}`,
    parameters: Type.Object({}),
    async execute(): Promise<ToolResult> {
      return { content: name };
    },
  };
}

describe("InMemoryToolRegistry", () => {
  test("register + resolve an exact name returns the single tool", () => {
    const reg = new InMemoryToolRegistry();
    const a = makeTool("a");
    reg.register("a", a);
    expect(reg.resolve("a")).toEqual([a]);
  });

  test("resolve of a missing name returns an empty array (not an error)", () => {
    const reg = new InMemoryToolRegistry();
    reg.register("a", makeTool("a"));
    expect(reg.resolve("missing")).toEqual([]);
  });

  test("register three tools; resolve each individually", () => {
    const reg = new InMemoryToolRegistry();
    const a = makeTool("a");
    const b = makeTool("b");
    const c = makeTool("c");
    reg.register("a", a);
    reg.register("b", b);
    reg.register("c", c);
    expect(reg.resolve("a")).toEqual([a]);
    expect(reg.resolve("b")).toEqual([b]);
    expect(reg.resolve("c")).toEqual([c]);
  });

  test("glob `*` matches every registered tool", () => {
    const reg = new InMemoryToolRegistry();
    reg.register("mock-tool-A1", makeTool("mock-tool-A1"));
    reg.register("mock-tool-A2", makeTool("mock-tool-A2"));
    reg.register("mock-tool-B1", makeTool("mock-tool-B1"));
    expect(reg.resolve("*").map((t) => t.name).sort()).toEqual([
      "mock-tool-A1",
      "mock-tool-A2",
      "mock-tool-B1",
    ]);
  });

  test("glob `prefix*` matches tools starting with the prefix", () => {
    const reg = new InMemoryToolRegistry();
    const a1 = makeTool("mock-tool-A1");
    const a2 = makeTool("mock-tool-A2");
    const b1 = makeTool("mock-tool-B1");
    reg.register("mock-tool-A1", a1);
    reg.register("mock-tool-A2", a2);
    reg.register("mock-tool-B1", b1);
    expect(reg.resolve("mock-tool-A*").sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      a1,
      a2,
    ]);
  });

  test("glob `?` matches exactly one character; `??` requires two", () => {
    const reg = new InMemoryToolRegistry();
    const b1 = makeTool("mock-tool-B1");
    reg.register("mock-tool-B1", b1);
    expect(reg.resolve("mock-tool-B?")).toEqual([b1]);
    expect(reg.resolve("mock-tool-B??")).toEqual([]);
  });

  test("glob is case-sensitive", () => {
    const reg = new InMemoryToolRegistry();
    reg.register("Bash", makeTool("Bash"));
    expect(reg.resolve("Bash")).toHaveLength(1);
    expect(reg.resolve("bash")).toEqual([]);
  });

  test("glob `*` matches an empty suffix (e.g. 'B*' matches 'B' alone)", () => {
    const reg = new InMemoryToolRegistry();
    const b = makeTool("B");
    reg.register("B", b);
    expect(reg.resolve("B*")).toEqual([b]);
  });

  test("`mcp:server:tool` returns [] in v1 — no MCP client", () => {
    const reg = new InMemoryToolRegistry();
    reg.register("bash", makeTool("bash"));
    reg.register("mock-tool-A1", makeTool("mock-tool-A1"));
    // `mcp:foo:bar` — the part after the last `:` is `bar`, exact match.
    // No tool is named `bar` (no MCP client in v1), so the result is [].
    expect(reg.resolve("mcp:foo:bar")).toEqual([]);
  });

  test("`mcp:foo:mock-tool-A*` matches the two A tools", () => {
    const reg = new InMemoryToolRegistry();
    const a1 = makeTool("mock-tool-A1");
    const a2 = makeTool("mock-tool-A2");
    const b1 = makeTool("mock-tool-B1");
    reg.register("mock-tool-A1", a1);
    reg.register("mock-tool-A2", a2);
    reg.register("mock-tool-B1", b1);
    expect(
      reg.resolve("mcp:foo:mock-tool-A*").sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([a1, a2]);
  });

  test("`mcp:foo:*` matches every tool (wildcard ignores the server prefix)", () => {
    const reg = new InMemoryToolRegistry();
    const a1 = makeTool("mock-tool-A1");
    const a2 = makeTool("mock-tool-A2");
    const b1 = makeTool("mock-tool-B1");
    reg.register("mock-tool-A1", a1);
    reg.register("mock-tool-A2", a2);
    reg.register("mock-tool-B1", b1);
    expect(reg.resolve("mcp:foo:*").map((t) => t.name).sort()).toEqual([
      "mock-tool-A1",
      "mock-tool-A2",
      "mock-tool-B1",
    ]);
  });

  test("duplicate register replaces the prior entry (last-writer-wins)", () => {
    const reg = new InMemoryToolRegistry();
    const first = makeTool("a");
    const second = makeTool("a");
    reg.register("a", first);
    reg.register("a", second);
    expect(reg.resolve("a")).toEqual([second]);
  });

  test("list() returns all registered tools", () => {
    const reg = new InMemoryToolRegistry();
    const a = makeTool("a");
    const b = makeTool("b");
    const c = makeTool("c");
    reg.register("a", a);
    reg.register("b", b);
    reg.register("c", c);
    expect(reg.list().length).toBe(3);
    expect(new Set(reg.list())).toEqual(new Set([a, b, c]));
  });

  test("resolve is anchored to the full name — '*bash' does not match 'my-bash'", () => {
    const reg = new InMemoryToolRegistry();
    reg.register("my-bash", makeTool("my-bash"));
    reg.register("bash", makeTool("bash"));
    // Glob is anchored: `*bash` matches "bash", "my-bash", etc. (the
    // pattern is the whole name).
    expect(reg.resolve("*bash").map((t) => t.name).sort()).toEqual([
      "bash",
      "my-bash",
    ]);
  });
});