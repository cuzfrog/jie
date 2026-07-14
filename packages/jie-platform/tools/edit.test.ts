import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditTool } from "./edit";
import { makeEmptyContext } from "./_test-context";

describe("edit", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-edit-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("single match replaces once and reports replacementsCount=1", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\ngamma\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "beta", new_string: "BETA" },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("alpha\nBETA\ngamma\n");
    expect(result.details).toMatchObject({
      path: "a.txt",
      replacementsCount: 1,
    });
  });

  test("multiple matches without replace_all -> ambiguous_match", async () => {
    writeFileSync(join(workspace, "a.txt"), "x y x y x");
    const tool = createEditTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "a.txt", old_string: "x", new_string: "X" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_MATCH" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("x y x y x");
  });

  test("multiple matches with replace_all replaces every occurrence", async () => {
    writeFileSync(join(workspace, "a.txt"), "x y x y x");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "x", new_string: "X", replace_all: true },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("X y X y X");
    expect(result.details).toMatchObject({ replacementsCount: 3 });
  });

  test("no match -> no_match", async () => {
    writeFileSync(join(workspace, "a.txt"), "hello world");
    const tool = createEditTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "a.txt", old_string: "missing", new_string: "X" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "NO_MATCH" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("hello world");
  });

  test("missing file -> file_not_found", async () => {
    const tool = createEditTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "ghost.txt", old_string: "x", new_string: "y" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  test("path escapes workspace -> path_escape", async () => {
    const tool = createEditTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "/etc/passwd", old_string: "root", new_string: "ROOT" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  test("multi-line old_string replaces only the matched block", async () => {
    writeFileSync(join(workspace, "a.txt"), "line1\nline2\nline3\nline4\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    await tool.execute(
      { path: "a.txt", old_string: "line2\nline3", new_string: "REPLACED" },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("line1\nREPLACED\nline4\n");
  });

  test("replacement can be longer or shorter than original", async () => {
    writeFileSync(join(workspace, "a.txt"), "short\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    await tool.execute(
      { path: "a.txt", old_string: "short", new_string: "a much longer replacement string" },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe(
      "a much longer replacement string\n",
    );
  });

  test("replace_all counts every substitution (overlapping not allowed)", async () => {
    writeFileSync(join(workspace, "a.txt"), "aaaa");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "aa", new_string: "X", replace_all: true },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("XX");
    expect(result.details).toMatchObject({ replacementsCount: 2 });
  });

  test("details carries diff hunks for display", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "b", new_string: "B" },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string };
    expect(details.diff).toContain("@@");
    expect(details.diff).toContain("-b");
    expect(details.diff).toContain("+B");
  });

  test("empty old_string -> no_match (defensive)", async () => {
    writeFileSync(join(workspace, "a.txt"), "hello");
    const tool = createEditTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "a.txt", old_string: "", new_string: "x" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "NO_MATCH" });
  });

  test("LLM-facing content summarizes the change in plain text", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "beta", new_string: "BETA" },
      makeEmptyContext(),
    );
    expect(result.content).toContain("a.txt");
    expect(result.content).toContain("1 replacement");
  });

  test("no-op edit (old_string === new_string) still writes the file and reports 1 replacement", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "beta", new_string: "beta" },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("alpha\nbeta\n");
    expect(result.details).toMatchObject({
      kind: "diff",
      replacementsCount: 1,
      diff: "",
    });
  });

  test("replace_all with empty new_string deletes every occurrence", async () => {
    writeFileSync(join(workspace, "a.txt"), "axbxcxd");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "x", new_string: "", replace_all: true },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("abcd");
    expect(result.details).toMatchObject({ replacementsCount: 3 });
  });

  test("file without trailing newline is preserved", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta");
    const tool = createEditTool({ workspaceRoot: workspace });
    await tool.execute(
      { path: "a.txt", old_string: "alpha", new_string: "ALPHA" },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("ALPHA\nbeta");
  });

  test("two near-adjacent edits merge into a single hunk", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "a\nb\nc", new_string: "a\nB\nc" },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string };
    const headerCount = (details.diff.match(/^@@/gm) ?? []).length;
    expect(headerCount).toBe(1);
  });

  test("diff emits exact unified-diff format for a small change", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "b", new_string: "B" },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string };
    expect(details.diff).toBe("@@ -1,3 +1,3 @@\n a\n-b\n+B\n c");
  });

  test("beforeBytes / afterBytes are UTF-8 byte counts, not UTF-16 code units", async () => {
    writeFileSync(join(workspace, "a.txt"), "héllo", "utf-8");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "héllo", new_string: "héllo!" },
      makeEmptyContext(),
    );
    const details = result.details as { beforeBytes: number; afterBytes: number };
    expect(details.beforeBytes).toBe(6);
    expect(details.afterBytes).toBe(7);
  });

  test("files larger than the diff line cap return details.diff === null", async () => {
    const big = Array.from({ length: 6_000 }, (_, i) => `line ${i}`).join("\n");
    writeFileSync(join(workspace, "big.txt"), big);
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "big.txt", old_string: "line 0", new_string: "LINE 0" },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string | null; replacementsCount: number };
    expect(details.diff).toBeNull();
    expect(details.replacementsCount).toBe(1);
  });

  test("details carries the discriminator kind: 'diff' for every successful edit", async () => {
    writeFileSync(join(workspace, "a.txt"), "x");
    const tool = createEditTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", old_string: "x", new_string: "y" },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ kind: "diff" });
  });
});