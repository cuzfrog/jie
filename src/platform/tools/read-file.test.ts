import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadFileTool } from "./read-file";
import { makeEmptyContext } from "./_test-context";
import type { ExecutionContext } from "./types";

describe("read_file", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-read-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("reads a small file", async () => {
    writeFileSync(join(workspace, "a.txt"), "hello\nworld\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt" }, makeEmptyContext());
    expect(result.content).toBe("hello\nworld\n");
    expect(result.details).toEqual({ truncated: { content: false } });
  });

  test("offset=0 is clamped to 1", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt", offset: 0 }, makeEmptyContext());
    expect(result.content).toBe("a\nb\nc\n");
  });

  test("offset=N reads from line N (1-indexed)", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\nd\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt", offset: 2 }, makeEmptyContext());
    expect(result.content).toBe("b\nc\nd\n");
  });

  test("limit=0 is treated as unset (default truncation applies)", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt", limit: 0 }, makeEmptyContext());
    expect(result.content).toBe("a\nb\nc\n");
  });

  test("limit=N caps the read at N lines", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\nd\ne\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", limit: 2 },
      makeEmptyContext(),
    );
    expect(result.content).toBe("a\nb\n");
  });

  test("offset beyond EOF returns empty content and truncated=false", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt", offset: 99 }, makeEmptyContext());
    expect(result.content).toBe("");
    expect(result.details).toEqual({ truncated: { content: false } });
  });

  test("UTF-8 BOM is preserved at offset=1", async () => {
    writeFileSync(join(workspace, "a.txt"), "\uFEFFhello\n");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt" }, makeEmptyContext());
    expect(result.content.startsWith("\uFEFF")).toBe(true);
  });

  test("default truncation caps at 2000 lines OR 50 KiB", async () => {
    const big = Array.from({ length: 3000 }, (_, i) => `line-${i + 1}`).join(
      "\n",
    );
    writeFileSync(join(workspace, "big.txt"), big);
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "big.txt" }, makeEmptyContext());
    expect(result.content).toContain("line-1");
    expect(result.content).toContain("line-2000");
    expect(result.content).not.toContain("line-2001");
    expect(result.details).toEqual({ truncated: { content: true } });
  });

  test("non-UTF-8 bytes -> unsupported_encoding", async () => {
    writeFileSync(join(workspace, "bad.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
    const tool = createReadFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "bad.bin" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ENCODING" });
  });

  test("path outside the workspace -> path_escape", async () => {
    const tool = createReadFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "/etc/passwd" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  test("missing file -> file_not_found", async () => {
    const tool = createReadFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "missing.txt" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  test("path is a directory -> is_a_directory", async () => {
    mkdirSync(join(workspace, "subdir"));
    const tool = createReadFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "subdir" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "IS_A_DIRECTORY" });
  });
});

describe("read_file - per-role path limits", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-read-limit-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function limitedContext(role: string, globs: ReadonlyArray<string>): ExecutionContext {
    return {
      ...makeEmptyContext(),
      agentRole: role,
      toolArgs: new Map([["read_file", globs]]),
    };
  }

  test("denies a path outside the allowed globs", async () => {
    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(join(workspace, "docs", "notes.md"), "x");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "docs/notes.md" }, limitedContext("architect", ["**/MODULE.md"])),
    ).rejects.toMatchObject({ code: "READ_PATH_DENIED" });
  });

  test("denies a path given as an absolute path too", async () => {
    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(join(workspace, "docs", "notes.md"), "x");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: join(workspace, "docs", "notes.md") },
        limitedContext("architect", ["src/**"]),
      ),
    ).rejects.toMatchObject({ code: "READ_PATH_DENIED" });
  });

  test("allows a path matching an allowed glob", async () => {
    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(join(workspace, "docs", "MODULE.md"), "ctx");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "docs/MODULE.md" },
      limitedContext("architect", ["**/MODULE.md"]),
    );
    expect(result.content).toBe("ctx");
  });

  test("no toolArgs restriction allows any path", async () => {
    mkdirSync(join(workspace, "docs"), { recursive: true });
    writeFileSync(join(workspace, "docs", "notes.md"), "free");
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "docs/notes.md" }, makeEmptyContext());
    expect(result.content).toBe("free");
  });

  test("checks the resolved real path so a symlink cannot bypass the limit", async () => {
    mkdirSync(join(workspace, "docs"));
    writeFileSync(join(workspace, "docs", "MODULE.md"), "via-symlink");
    symlinkSync(join(workspace, "docs"), join(workspace, "alias"));
    const tool = createReadFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "alias/MODULE.md" },
      limitedContext("architect", ["docs/*"]),
    );
    expect(result.content).toBe("via-symlink");
  });
});
