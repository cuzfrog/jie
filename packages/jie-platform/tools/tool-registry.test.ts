import { Type } from "typebox";
import { createEventManager } from "../event";
import {
  createArtifactStore,
  createStorage,
} from "../storage";
import { createToolRegistry, type ToolRegistry } from "./tool-registry";
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
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createToolRegistry({
    workspaceRoot: "/tmp",
    eventManager: createEventManager(),
    artifactStore: createArtifactStore(storage),
  });
}

describe("createToolRegistry", () => {
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

  test("`mcp:server:tool` returns [] in v1 — no MCP client", () => {
    const reg = makeReg();
    expect(reg.resolve("mcp:foo:bar")).toEqual([]);
  });

  test("`mcp:foo:mock-tool-A*` matches the two A tools", () => {
    const reg = makeReg();
    const a1 = makeTool("mock-tool-A1");
    const a2 = makeTool("mock-tool-A2");
    reg.register("mock-tool-A1", a1);
    reg.register("mock-tool-A2", a2);
    expect(
      reg.resolve("mcp:foo:mock-tool-A*").sort((a, b) => a.name.localeCompare(b.name)),
    ).toEqual([a1, a2]);
  });

  test("`mcp:foo:*` matches every tool (wildcard ignores the server prefix)", () => {
    const reg = makeReg();
    reg.register("mock-tool-A1", makeTool("mock-tool-A1"));
    reg.register("mock-tool-A2", makeTool("mock-tool-A2"));
    reg.register("mock-tool-B1", makeTool("mock-tool-B1"));
    expect(reg.resolve("mcp:foo:mock-tool-*").map((t) => t.name).sort()).toEqual([
      "mock-tool-A1",
      "mock-tool-A2",
      "mock-tool-B1",
    ]);
  });

  test("duplicate register replaces the prior entry (last-writer-wins)", () => {
    const reg = makeReg();
    const first = makeTool("a");
    const second = makeTool("a");
    reg.register("a", first);
    reg.register("a", second);
    expect(reg.resolve("a")).toEqual([second]);
  });

  test("list() returns all registered tools (built-ins + custom)", () => {
    const reg = makeReg();
    reg.register("a", makeTool("a"));
    reg.register("b", makeTool("b"));
    reg.register("c", makeTool("c"));
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toContain("a");
    expect(names).toContain("b");
    expect(names).toContain("c");
    expect(names).toContain("bash");
    expect(names).toContain("read_file");
    expect(names).toContain("write_file");
    expect(names).toContain("edit");
    expect(names).toContain("read_artifact");
    expect(names).toContain("write_artifact");
    expect(names).toContain("notify");
    expect(names).toContain("web_fetch");
    expect(names).toContain("web_search");
  });

  test("resolve is anchored to the full name — '*bash' matches both 'bash' and 'my-bash'", () => {
    const reg = makeReg();
    reg.register("my-bash", makeTool("my-bash"));

    expect(reg.resolve("*bash").map((t) => t.name).sort()).toEqual([
      "bash",
      "my-bash",
    ]);
  });
});

describe("createToolRegistry — built-in installation", () => {
  test("populated registry: list() contains all 9 built-ins", () => {
    const reg = makeReg();
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toEqual([
      "bash",
      "edit",
      "notify",
      "read_artifact",
      "read_file",
      "web_fetch",
      "web_search",
      "write_artifact",
      "write_file",
    ]);
  });

  test("populated registry: resolve() returns the matching installed tool for each built-in", () => {
    const reg = makeReg();
    for (const name of ["bash", "read_file", "write_file", "edit", "notify", "web_search", "web_fetch", "read_artifact", "write_artifact"]) {
      const matches = reg.resolve(name);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe(name);
    }
  });
});
