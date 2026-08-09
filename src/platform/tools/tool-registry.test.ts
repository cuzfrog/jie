import { Type } from "typebox";
import { InMemoryToolRegistry, type ToolRegistry } from "./tool-registry";
import type { Tool, ToolResult } from "./types";

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

function makeReg(): ToolRegistry {
  return new InMemoryToolRegistry([]);
}

describe("InMemoryToolRegistry", () => {
  test("register + resolve an exact name returns the single tool", () => {
    const reg = makeReg();
    const a = makeTool("a");
    reg.register("a", a);
    expect(reg.resolve("a")).toEqual([a]);
  });

  test("resolve of a missing name returns an empty array (not an error)", () => {
    const reg = makeReg();
    reg.register("a", makeTool("a"));
    expect(reg.resolve("missing")).toEqual([]);
  });

  test("register three tools; resolve each individually", () => {
    const reg = makeReg();
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
    const reg = makeReg();
    reg.register("mock-tool-A1", makeTool("mock-tool-A1"));
    reg.register("mock-tool-A2", makeTool("mock-tool-A2"));
    reg.register("mock-tool-B1", makeTool("mock-tool-B1"));
    expect(reg.resolve("mock-tool-*").map((t) => t.name).sort()).toEqual([
      "mock-tool-A1",
      "mock-tool-A2",
      "mock-tool-B1",
    ]);
  });

  test("glob `prefix*` matches tools starting with the prefix", () => {
    const reg = makeReg();
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
    const reg = makeReg();
    const b1 = makeTool("mock-tool-B1");
    reg.register("mock-tool-B1", b1);
    expect(reg.resolve("mock-tool-B?")).toEqual([b1]);
    expect(reg.resolve("mock-tool-B??")).toEqual([]);
  });

  test("glob is case-sensitive", () => {
    const reg = makeReg();
    reg.register("Bash", makeTool("Bash"));
    expect(reg.resolve("Bash")).toHaveLength(1);
    expect(reg.resolve("bash")).not.toEqual([makeTool("Bash")]);
  });

  test("glob `*` matches an empty suffix (e.g. 'B*' matches 'B' alone)", () => {
    const reg = makeReg();
    const b = makeTool("B");
    reg.register("B", b);
    expect(reg.resolve("B*")).toEqual([b]);
  });

  test("`mcp:server:tool` resolves a tool registered under that exact name", () => {
    const reg = makeReg();
    const tool = makeTool("mcp:foo:bar");
    reg.register("mcp:foo:bar", tool);
    expect(reg.resolve("mcp:foo:bar")).toEqual([tool]);
  });

  test("`mcp:foo:*` matches only that server's tools, never builtins or other servers", () => {
    const reg = makeReg();
    const a1 = makeTool("mcp:foo:mock-tool-A1");
    const a2 = makeTool("mcp:foo:mock-tool-A2");
    reg.register("mcp:foo:mock-tool-A1", a1);
    reg.register("mcp:foo:mock-tool-A2", a2);
    reg.register("mcp:bar:mock-tool-B1", makeTool("mcp:bar:mock-tool-B1"));
    expect(reg.resolve("mcp:foo:*").sort((a, b) => a.name.localeCompare(b.name))).toEqual([a1, a2]);
  });

  test("`mcp:foo:*` matches nothing when that server registered no tools", () => {
    const reg = makeReg();
    reg.register("mock-tool-A1", makeTool("mock-tool-A1"));
    expect(reg.resolve("mcp:foo:*")).toEqual([]);
  });

  test("duplicate register replaces the prior entry (last-writer-wins)", () => {
    const reg = makeReg();
    const first = makeTool("a");
    const second = makeTool("a");
    reg.register("a", first);
    reg.register("a", second);
    expect(reg.resolve("a")).toEqual([second]);
  });

  test("list() returns every registered tool", () => {
    const reg = makeReg();
    reg.register("a", makeTool("a"));
    reg.register("b", makeTool("b"));
    reg.register("c", makeTool("c"));
    expect(reg.list().map((t) => t.name).sort()).toEqual(["a", "b", "c"]);
  });

  test("resolve is anchored to the full name - '*bash' matches both 'bash' and 'my-bash'", () => {
    const reg = makeReg();
    reg.register("bash", makeTool("bash"));
    reg.register("my-bash", makeTool("my-bash"));
    expect(reg.resolve("*bash").map((t) => t.name).sort()).toEqual(["bash", "my-bash"]);
  });

  test("constructor seeds the registry from the provided builtin list", () => {
    const reg = new InMemoryToolRegistry([
      { name: "seeded-a", tool: makeTool("seeded-a") },
      { name: "seeded-b", tool: makeTool("seeded-b") },
    ]);
    expect(reg.list().map((t) => t.name).sort()).toEqual(["seeded-a", "seeded-b"]);
    expect(reg.resolve("seeded-*").map((t) => t.name).sort()).toEqual(["seeded-a", "seeded-b"]);
  });
});
