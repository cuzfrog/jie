import { Type } from "typebox";
import type { SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { MemoryStore } from "../memory";
import type { ArtifactStore, KanbanStore } from "../storage";
import { InMemoryToolRegistry, type ToolRegistry } from "./tool-registry";
import type { Tool, ToolResult } from "./types";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
});

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  editContent: vi.fn(),
});

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
  return new InMemoryToolRegistry("/tmp", eventManager, artifactStore, memoryStore, settingsStore, kanbanStore);
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

describe("InMemoryToolRegistry — built-in installation", () => {
  test("populated registry: list() contains all 11 built-ins", () => {
    const reg = makeReg();
    const names = reg.list().map((t) => t.name).sort();
    expect(names).toEqual([
      "bash",
      "edit",
      "kanban_write",
      "memory_search",
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
    for (const name of ["bash", "read_file", "write_file", "edit", "notify", "web_search", "web_fetch", "read_artifact", "write_artifact", "kanban_write", "memory_search"]) {
      const matches = reg.resolve(name);
      expect(matches).toHaveLength(1);
      expect(matches[0]!.name).toBe(name);
    }
  });
});
