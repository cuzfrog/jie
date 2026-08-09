import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFindFileTool } from "./find-file";
import { makeEmptyContext } from "./_test-context";

describe("find_file", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-find-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("finds files recursively with a ** glob", async () => {
    mkdirSync(join(workspace, "src", "util"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "");
    writeFileSync(join(workspace, "src", "util", "b.ts"), "");
    writeFileSync(join(workspace, "readme.md"), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "**/*.ts" }, makeEmptyContext());
    expect(result.content).toBe("src/a.ts\nsrc/util/b.ts\n[2 matches]");
    expect(result.details).toEqual({
      kind: "find",
      matches: ["src/a.ts", "src/util/b.ts"],
      truncated: false,
    });
  });

  test("pattern matches relative to the scoped path; results stay workspace-relative", async () => {
    mkdirSync(join(workspace, "src", "util"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "");
    writeFileSync(join(workspace, "src", "util", "b.ts"), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "**/*.ts", path: "src" }, makeEmptyContext());
    expect(result.content).toContain("src/a.ts");
    expect(result.content).toContain("src/util/b.ts");
  });

  test("prunes node_modules and .git", async () => {
    mkdirSync(join(workspace, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(workspace, "node_modules", "pkg", "index.ts"), "");
    mkdirSync(join(workspace, ".git"), { recursive: true });
    writeFileSync(join(workspace, ".git", "hook.ts"), "");
    writeFileSync(join(workspace, "app.ts"), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "**/*.ts" }, makeEmptyContext());
    expect(result.content).toBe("app.ts\n[1 match]");
  });

  test("* does not cross path separators", async () => {
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "top.ts"), "");
    writeFileSync(join(workspace, "src", "nested.ts"), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "*.ts" }, makeEmptyContext());
    expect(result.content).toBe("top.ts\n[1 match]");
  });

  test("no matches reports a message", async () => {
    writeFileSync(join(workspace, "a.txt"), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "**/*.ts" }, makeEmptyContext());
    expect(result.content).toBe("No files matching: **/*.ts");
    expect(result.details).toEqual({ kind: "find", matches: [], truncated: false });
  });

  test("caps at 100 matches with a truncation footer", async () => {
    for (let i = 0; i < 120; i++) writeFileSync(join(workspace, `f${i}.ts`), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ pattern: "*.ts" }, makeEmptyContext());
    expect(result.details).toMatchObject({ kind: "find", truncated: true });
    expect(result.content.split("\n").length).toBe(101);
    expect(result.content).toContain("[showing first 100 matches");
  });

  test("path is a file -> not_a_directory", async () => {
    writeFileSync(join(workspace, "a.txt"), "");
    const tool = createFindFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "*", path: "a.txt" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "NOT_A_DIRECTORY" });
  });

  test("missing path -> file_not_found", async () => {
    const tool = createFindFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "*", path: "nope" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  test("path outside workspace -> path_escape", async () => {
    const tool = createFindFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute({ pattern: "*", path: "/etc" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });
});
