import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGrepFileTool } from "./grep-file";
import { makeEmptyContext } from "./_test-context";
import type { ExecutionContext } from "./types";

describe("grep_file", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-grep-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("finds matches in a single file as path:line:content", async () => {
    writeFileSync(join(workspace, "a.ts"), "function foo()\nfunction bar()\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo", path: "a.ts" }, makeEmptyContext());
    expect(result.content).toBe("a.ts:1:function foo()\n[1 match]");
  });

  test("finds matches across files in a directory", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "function foo()\n");
    writeFileSync(join(workspace, "src", "b.ts"), "const foo = 1\n");
    writeFileSync(join(workspace, "src", "c.ts"), "no match\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo", path: "src" }, makeEmptyContext());
    expect(result.content).toContain("src/a.ts:1:function foo()");
    expect(result.content).toContain("src/b.ts:1:const foo = 1");
    expect(result.content).not.toContain("src/c.ts");
    expect(result.content).toContain("[2 matches]");
  });

  test("include glob filters which files to scan", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "foo\n");
    writeFileSync(join(workspace, "src", "b.md"), "foo\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "foo", path: "src", include: "*.ts" },
      makeEmptyContext(),
    );
    expect(result.content).toContain("src/a.ts:1:foo");
    expect(result.content).not.toContain("b.md");
  });

  test("ignoreCase makes the match case-insensitive", async () => {
    writeFileSync(join(workspace, "a.ts"), "Hello\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "hello", path: "a.ts", ignoreCase: true },
      makeEmptyContext(),
    );
    expect(result.content).toBe("a.ts:1:Hello\n[1 match]");
  });

  test("prunes node_modules", async () => {
    mkdirSync(join(workspace, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(workspace, "node_modules", "pkg", "x.ts"), "foo\n");
    writeFileSync(join(workspace, "app.ts"), "foo\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo" }, makeEmptyContext());
    expect(result.content).toBe("app.ts:1:foo\n[1 match]");
  });

  test("long matching lines are truncated", async () => {
    const long = `foo ${"x".repeat(600)}`;
    writeFileSync(join(workspace, "a.ts"), `${long}\n`);
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo", path: "a.ts" }, makeEmptyContext());
    expect(result.content).toContain("[truncated]");
    expect(result.content).toContain("foo ");
  });

  test("skips non-UTF-8 files without throwing", async () => {
    writeFileSync(join(workspace, "a.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
    writeFileSync(join(workspace, "b.ts"), "foo\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo" }, makeEmptyContext());
    expect(result.content).toBe("b.ts:1:foo\n[1 match]");
  });

  test("invalid regex -> invalid_pattern", async () => {
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "(", path: "a.ts" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "INVALID_PATTERN" });
  });

  test("no matches reports a message", async () => {
    writeFileSync(join(workspace, "a.ts"), "hello\n");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "zzz", path: "a.ts" }, makeEmptyContext());
    expect(result.content).toBe("No matches for: zzz");
  });

  test("missing path -> file_not_found", async () => {
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "foo", path: "nope" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  test("path outside workspace -> path_escape", async () => {
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "foo", path: "/etc" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  test("caps at 100 matches with a truncation footer", async () => {
    const lines = `${Array.from({ length: 120 }, () => "foo").join("\n")}\n`;
    writeFileSync(join(workspace, "a.ts"), lines);
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo", path: "a.ts" }, makeEmptyContext());
    expect(result.details).toMatchObject({ kind: "grep", truncated: true });
    expect(result.content.split("\n").length).toBe(101);
    expect(result.content).toContain("refine your pattern");
  });
});

describe("grep_file - per-role path limits", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-grep-limit-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function limitedContext(role: string, globs: ReadonlyArray<string>): ExecutionContext {
    return {
      ...makeEmptyContext(),
      agentRole: role,
      toolArgs: new Map([["grep_file", globs]]),
    };
  }

  test("denies a single disallowed file", async () => {
    writeFileSync(join(workspace, "notes.md"), "foo");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "foo", path: "notes.md" }, limitedContext("architect", ["**/MODULE.md"])),
    ).rejects.toMatchObject({ code: "READ_PATH_DENIED" });
  });

  test("allows a single file matching an allowed glob", async () => {
    writeFileSync(join(workspace, "MODULE.md"), "foo");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "foo", path: "MODULE.md" },
      limitedContext("architect", ["**/MODULE.md"]),
    );
    expect(result.content).toContain("MODULE.md:1:foo");
  });

  test("directory search only scans allowed files", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "MODULE.md"), "foo");
    writeFileSync(join(workspace, "src", "notes.md"), "foo");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "foo", path: "src" },
      limitedContext("architect", ["**/MODULE.md"]),
    );
    expect(result.content).toContain("src/MODULE.md:1:foo");
    expect(result.content).not.toContain("src/notes.md");
  });

  test("directory search with no allowed files reports no matches", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "foo");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "foo", path: "src" },
      limitedContext("architect", ["**/MODULE.md"]),
    );
    expect(result.content).toBe("No matches for: foo");
  });

  test("directory search intersects include with manifest globs", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "MODULE.md"), "foo");
    writeFileSync(join(workspace, "src", "a.ts"), "foo");
    writeFileSync(join(workspace, "src", "b.md"), "foo");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "foo", path: "src", include: "*.md" },
      limitedContext("architect", ["**/MODULE.md"]),
    );
    expect(result.content).toContain("src/MODULE.md:1:foo");
    expect(result.content).not.toContain("src/b.md");
    expect(result.content).not.toContain("src/a.ts");
  });

  test("no toolArgs restriction searches any path", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "foo");
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "foo", path: "src" }, makeEmptyContext());
    expect(result.content).toContain("src/a.ts:1:foo");
  });

  test("checks resolved real path so a symlink cannot bypass the limit", async () => {
    mkdirSync(join(workspace, "docs"));
    writeFileSync(join(workspace, "docs", "MODULE.md"), "foo");
    symlinkSync(join(workspace, "docs"), join(workspace, "alias"));
    const tool = createGrepFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { pattern: "foo", path: "alias/MODULE.md" },
      limitedContext("architect", ["docs/*"]),
    );
    expect(result.content).toContain("docs/MODULE.md:1:foo");
  });
});
