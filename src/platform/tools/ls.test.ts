import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLsTool } from "./ls";
import { makeEmptyContext } from "./_test-context";

describe("ls", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-ls-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("lists direct children with dirs suffixed / and files plain", async () => {
    mkdirSync(join(workspace, "subdir"));
    writeFileSync(join(workspace, "a.txt"), "");
    writeFileSync(join(workspace, "b.md"), "");
    const tool = createLsTool({ workspaceRoot: workspace });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.content).toBe("subdir/\na.txt\nb.md\n[3 entries]");
    expect(result.details).toEqual({ kind: "ls", truncated: false });
  });

  test("defaults to workspace root when path is omitted", async () => {
    writeFileSync(join(workspace, "root.txt"), "");
    const tool = createLsTool({ workspaceRoot: workspace });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.content).toContain("root.txt");
  });

  test("lists a subdirectory by relative path", async () => {
    mkdirSync(join(workspace, "pkg"));
    writeFileSync(join(workspace, "pkg", "index.ts"), "");
    const tool = createLsTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "pkg" }, makeEmptyContext());
    expect(result.content).toBe("index.ts\n[1 entry]");
  });

  test("empty directory reports zero entries", async () => {
    mkdirSync(join(workspace, "empty"));
    const tool = createLsTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "empty" }, makeEmptyContext());
    expect(result.content).toBe("[0 entries]");
  });

  test("symlinks are suffixed with @", async () => {
    writeFileSync(join(workspace, "real.txt"), "");
    symlinkSync(join(workspace, "real.txt"), join(workspace, "link.txt"));
    const tool = createLsTool({ workspaceRoot: workspace });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.content).toContain("link.txt@");
    expect(result.content).toContain("real.txt");
  });

  test("caps at 500 entries with a truncation footer", async () => {
    for (let i = 0; i < 501; i++) writeFileSync(join(workspace, `f${i}.txt`), "");
    const tool = createLsTool({ workspaceRoot: workspace });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.details).toEqual({ kind: "ls", truncated: true });
    expect(result.content).toContain("[showing 500 of 501 entries]");
    expect(result.content.split("\n").length).toBe(501);
  });

  test("path is a file -> not_a_directory", async () => {
    writeFileSync(join(workspace, "a.txt"), "");
    const tool = createLsTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "a.txt" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "NOT_A_DIRECTORY" });
  });

  test("missing path -> file_not_found", async () => {
    const tool = createLsTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "nope" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  test("path outside workspace -> path_escape", async () => {
    const tool = createLsTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ path: "/etc" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });
});
