import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEditTool } from "./edit";
import { createFileMutationQueue, type FileMutationQueue } from "./file-mutation-queue";
import { makeEmptyContext } from "./_test-context";
import type { ExecutionContext } from "./types";

const fileMutationQueue = createFileMutationQueue();

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
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "beta", new_string: "BETA" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("alpha\nBETA\ngamma\n");
    expect(result.details).toMatchObject({
      path: "a.txt",
      replacementsCount: 1,
    });
  });

  test("execute acquires the mutation queue on the resolved path", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\n");
    const queuedPaths: string[] = [];
    const queue: FileMutationQueue = {
      run(path, operation) {
        queuedPaths.push(path);
        return operation();
      },
    };
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue: queue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "alpha", new_string: "beta" }] },
      makeEmptyContext(),
    );
    expect(queuedPaths).toEqual([join(workspace, "a.txt")]);
    expect(result.details).toMatchObject({ replacementsCount: 1 });
  });

  test("multiple matches without replace_all -> ambiguous_match", async () => {
    writeFileSync(join(workspace, "a.txt"), "x y x y x");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        { path: "a.txt", edits: [{ old_string: "x", new_string: "X" }] },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_MATCH" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("x y x y x");
  });

  test("multiple matches with replace_all replaces every occurrence", async () => {
    writeFileSync(join(workspace, "a.txt"), "x y x y x");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "x", new_string: "X" }], replace_all: true },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("X y X y X");
    expect(result.details).toMatchObject({ replacementsCount: 3 });
  });

  test("no match -> no_match", async () => {
    writeFileSync(join(workspace, "a.txt"), "hello world");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        { path: "a.txt", edits: [{ old_string: "missing", new_string: "X" }] },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "NO_MATCH" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("hello world");
  });

  test("missing file -> file_not_found", async () => {
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        { path: "ghost.txt", edits: [{ old_string: "x", new_string: "y" }] },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });

  test("path escapes workspace -> path_escape", async () => {
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        { path: "/etc/passwd", edits: [{ old_string: "root", new_string: "ROOT" }] },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  test("multi-line old_string replaces only the matched block", async () => {
    writeFileSync(join(workspace, "a.txt"), "line1\nline2\nline3\nline4\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "line2\nline3", new_string: "REPLACED" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("line1\nREPLACED\nline4\n");
  });

  test("replacement can be longer or shorter than original", async () => {
    writeFileSync(join(workspace, "a.txt"), "short\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "short", new_string: "a much longer replacement string" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe(
      "a much longer replacement string\n",
    );
  });

  test("replace_all counts every substitution (overlapping not allowed)", async () => {
    writeFileSync(join(workspace, "a.txt"), "aaaa");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "aa", new_string: "X" }], replace_all: true },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("XX");
    expect(result.details).toMatchObject({ replacementsCount: 2 });
  });

  test("details carries diff hunks for display", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "b", new_string: "B" }] },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string };
    expect(details.diff).toContain("@@");
    expect(details.diff).toContain("-b");
    expect(details.diff).toContain("+B");
  });

  test("empty old_string -> no_match (defensive)", async () => {
    writeFileSync(join(workspace, "a.txt"), "hello");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        { path: "a.txt", edits: [{ old_string: "", new_string: "x" }] },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "NO_MATCH" });
  });

  test("LLM-facing content is a one-line ack without the diff", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "beta", new_string: "BETA" }] },
      makeEmptyContext(),
    );
    expect(result.content).toBe("Edited a.txt: 1 replacement");
    expect(result.content).not.toContain("@@");
    expect(result.content).not.toContain("-beta");
  });

  test("no-op edit (old_string === new_string) still writes the file and reports 1 replacement", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "beta", new_string: "beta" }] },
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
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "x", new_string: "" }], replace_all: true },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("abcd");
    expect(result.details).toMatchObject({ replacementsCount: 3 });
  });

  test("file without trailing newline is preserved", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "alpha", new_string: "ALPHA" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("ALPHA\nbeta");
  });

  test("beforeBytes / afterBytes are UTF-8 byte counts, not UTF-16 code units", async () => {
    writeFileSync(join(workspace, "a.txt"), "héllo", "utf-8");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "héllo", new_string: "héllo!" }] },
      makeEmptyContext(),
    );
    const details = result.details as { beforeBytes: number; afterBytes: number };
    expect(details.beforeBytes).toBe(6);
    expect(details.afterBytes).toBe(7);
  });

  test("files larger than the diff line cap return details.diff === null", async () => {
    const big = Array.from({ length: 6_000 }, (_, i) => `line ${i}`).join("\n");
    writeFileSync(join(workspace, "big.txt"), big);
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "big.txt", edits: [{ old_string: "line 0", new_string: "LINE 0" }] },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string | null; replacementsCount: number };
    expect(details.diff).toBeNull();
    expect(details.replacementsCount).toBe(1);
  });

  test("details carries the discriminator kind: 'diff' for every successful edit", async () => {
    writeFileSync(join(workspace, "a.txt"), "x");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "x", new_string: "y" }] },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ kind: "diff" });
  });
});

describe("edit line-ending and BOM tolerance", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-edit-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("CRLF file matches an LF old_string and keeps CRLF on write", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\r\nbeta\r\ngamma\r\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "alpha\nbeta", new_string: "X" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("X\r\ngamma\r\n");
  });

  test("LF file matches a CRLF old_string and stays LF on write", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "alpha\r\nbeta", new_string: "X" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("X\n");
  });

  test("new_string line endings follow the file's detected ending", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\r\nbeta\r\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "beta", new_string: "one\ntwo" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("alpha\r\none\r\ntwo\r\n");
  });

  test("a BOM is ignored for matching and preserved on write", async () => {
    writeFileSync(join(workspace, "a.txt"), "\uFEFFalpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "alpha", new_string: "ALPHA" }] },
      makeEmptyContext(),
    );
    const after = readFileSync(join(workspace, "a.txt"), "utf-8");
    expect(after.charCodeAt(0)).toBe(0xfeff);
    expect(after).toBe("\uFEFFALPHA\nbeta\n");
  });

  test("BOM+CRLF file matches an LF old_string at the first line and keeps both", async () => {
    writeFileSync(join(workspace, "a.txt"), "\uFEFFalpha\r\nbeta\r\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      { path: "a.txt", edits: [{ old_string: "alpha\nbeta", new_string: "X" }] },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("\uFEFFX\r\n");
  });

  test("beforeBytes / afterBytes count the actual file bytes including CRLF and BOM", async () => {
    writeFileSync(join(workspace, "a.txt"), "\uFEFFa\r\nb\r\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "b", new_string: "B" }] },
      makeEmptyContext(),
    );
    const details = result.details as { beforeBytes: number; afterBytes: number };
    expect(details.beforeBytes).toBe(9);
    expect(details.afterBytes).toBe(9);
  });

  test("the diff preview renders normalized LF content without carriage returns", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\r\nbeta\r\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      { path: "a.txt", edits: [{ old_string: "beta", new_string: "BETA" }] },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string };
    expect(details.diff).toContain("-beta");
    expect(details.diff).not.toContain("\r");
  });
});

describe("edit with multiple disjoint edits", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-edit-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("applies several disjoint edits in one call, each matched against the original content", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\ngamma\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      {
        path: "a.txt",
        edits: [
          { old_string: "beta", new_string: "BETA" },
          { old_string: "alpha", new_string: "ALPHA" },
        ],
      },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("ALPHA\nBETA\ngamma\n");
    expect(result.details).toMatchObject({ replacementsCount: 2 });
    expect(result.content).toBe("Edited a.txt: 2 replacements");
  });

  test("an earlier edit's replacement is not visible to a later edit's matching", async () => {
    writeFileSync(join(workspace, "a.txt"), "one\ntwo\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      {
        path: "a.txt",
        edits: [
          { old_string: "one", new_string: "two" },
          { old_string: "two", new_string: "TWO" },
        ],
      },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("two\nTWO\n");
  });

  test("overlapping edits -> overlapping_edits, file untouched", async () => {
    writeFileSync(join(workspace, "a.txt"), "abcdef");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        {
          path: "a.txt",
          edits: [
            { old_string: "abc", new_string: "X" },
            { old_string: "cde", new_string: "Y" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "OVERLAPPING_EDITS" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("abcdef");
  });

  test("nested edits -> overlapping_edits", async () => {
    writeFileSync(join(workspace, "a.txt"), "abcdef");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        {
          path: "a.txt",
          edits: [
            { old_string: "abcd", new_string: "X" },
            { old_string: "bc", new_string: "Y" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "OVERLAPPING_EDITS" });
  });

  test("duplicate entries targeting the same region -> overlapping_edits", async () => {
    writeFileSync(join(workspace, "a.txt"), "abc");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        {
          path: "a.txt",
          edits: [
            { old_string: "ab", new_string: "X" },
            { old_string: "ab", new_string: "Y" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "OVERLAPPING_EDITS" });
  });

  test("adjacent edits sharing a boundary are applied", async () => {
    writeFileSync(join(workspace, "a.txt"), "abcd");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      {
        path: "a.txt",
        edits: [
          { old_string: "ab", new_string: "X" },
          { old_string: "cd", new_string: "Y" },
        ],
      },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("XY");
  });

  test("a twice-matching entry without replace_all -> ambiguous_match naming the edit", async () => {
    writeFileSync(join(workspace, "a.txt"), "x y x z");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        {
          path: "a.txt",
          edits: [
            { old_string: "z", new_string: "Z" },
            { old_string: "x", new_string: "X" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "AMBIGUOUS_MATCH", detail: "2 matches in edits[1] of a.txt" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("x y x z");
  });

  test("a missing entry -> no_match naming the edit", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        {
          path: "a.txt",
          edits: [
            { old_string: "alpha", new_string: "ALPHA" },
            { old_string: "missing", new_string: "X" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "NO_MATCH", detail: "edits[1] of a.txt" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("alpha\nbeta\n");
  });

  test("replace_all applies to every entry of the batch", async () => {
    writeFileSync(join(workspace, "a.txt"), "x a x b");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      {
        path: "a.txt",
        edits: [
          { old_string: "x", new_string: "X" },
          { old_string: "a", new_string: "A" },
        ],
        replace_all: true,
      },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("X A X b");
    expect(result.details).toMatchObject({ replacementsCount: 3 });
  });

  test("replace_all spans of one entry colliding with another entry -> overlapping_edits", async () => {
    writeFileSync(join(workspace, "a.txt"), "aba");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        {
          path: "a.txt",
          edits: [
            { old_string: "a", new_string: "X" },
            { old_string: "ab", new_string: "Y" },
          ],
          replace_all: true,
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "OVERLAPPING_EDITS" });
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("aba");
  });

  test("an empty old_string in an entry -> no_match", async () => {
    writeFileSync(join(workspace, "a.txt"), "hello");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute(
        { path: "a.txt", edits: [{ old_string: "", new_string: "x" }] },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "NO_MATCH" });
  });

  test("batch edits compose with line-ending normalization", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\r\nbeta\r\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute(
      {
        path: "a.txt",
        edits: [
          { old_string: "alpha\nbeta", new_string: "X\nY" },
        ],
      },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("X\r\nY\r\n");
  });

  test("the diff covers every edit of the batch", async () => {
    writeFileSync(join(workspace, "a.txt"), "alpha\nbeta\ngamma\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    const result = await tool.execute(
      {
        path: "a.txt",
        edits: [
          { old_string: "alpha", new_string: "ALPHA" },
          { old_string: "gamma", new_string: "GAMMA" },
        ],
      },
      makeEmptyContext(),
    );
    const details = result.details as { diff: string };
    expect(details.diff).toContain("-alpha");
    expect(details.diff).toContain("+ALPHA");
    expect(details.diff).toContain("-gamma");
    expect(details.diff).toContain("+GAMMA");
  });
});

describe("edit prepareArguments", () => {
  test("rewrites the legacy single-pair form into an edits array", () => {
    const tool = createEditTool({ workspaceRoot: "/tmp", fileMutationQueue });
    const prepared = tool.prepareArguments!({
      path: "a.txt",
      old_string: "x",
      new_string: "y",
      replace_all: true,
    });
    expect(prepared).toEqual({
      path: "a.txt",
      edits: [{ old_string: "x", new_string: "y" }],
      replace_all: true,
    });
  });

  test("parses a JSON-string edits array", () => {
    const tool = createEditTool({ workspaceRoot: "/tmp", fileMutationQueue });
    const prepared = tool.prepareArguments!({
      path: "a.txt",
      edits: JSON.stringify([{ old_string: "x", new_string: "y" }]),
    });
    expect(prepared).toEqual({ path: "a.txt", edits: [{ old_string: "x", new_string: "y" }] });
  });

  test("passes canonical input through unchanged", () => {
    const tool = createEditTool({ workspaceRoot: "/tmp", fileMutationQueue });
    const input = { path: "a.txt", edits: [{ old_string: "x", new_string: "y" }] };
    expect(tool.prepareArguments!(input)).toEqual(input);
  });

  test("passes non-object input through for schema rejection", () => {
    const tool = createEditTool({ workspaceRoot: "/tmp", fileMutationQueue });
    expect(tool.prepareArguments!("nonsense")).toBe("nonsense");
    expect(tool.prepareArguments!(null)).toBeNull();
  });

  test("an unparseable JSON-string edits value passes through for schema rejection", () => {
    const tool = createEditTool({ workspaceRoot: "/tmp", fileMutationQueue });
    const input = { path: "a.txt", edits: "[not json" };
    expect(tool.prepareArguments!(input)).toBe(input);
  });

  test("a JSON-string edits value parsing to a non-array passes through for schema rejection", () => {
    const tool = createEditTool({ workspaceRoot: "/tmp", fileMutationQueue });
    const input = { path: "a.txt", edits: "{\"old_string\": \"x\"}" };
    expect(tool.prepareArguments!(input)).toBe(input);
  });
});

describe("edit — write gates", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-edit-gate-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  function gatedContext(role: string): ExecutionContext {
    return {
      ...makeEmptyContext(),
      agentRole: role,
      lifecycle: {
        maxIterations: 5,
        permanentPhases: [],
        transitions: [],
        writeGates: [{ pattern: "**/CONTEXT.md", roles: ["architect"] }],
      },
    };
  }

  test("denies editing a gated path for a role outside the gate and leaves the file untouched", async () => {
    writeFileSync(join(workspace, "CONTEXT.md"), "old\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await expect(
      tool.execute({ path: "CONTEXT.md", edits: [{ old_string: "old", new_string: "new" }] }, gatedContext("implementer")),
    ).rejects.toMatchObject({ code: "WRITE_GATE_DENIED" });
    expect(readFileSync(join(workspace, "CONTEXT.md"), "utf-8")).toBe("old\n");
  });

  test("allows editing a gated path for a listed role", async () => {
    writeFileSync(join(workspace, "CONTEXT.md"), "old\n");
    const tool = createEditTool({ workspaceRoot: workspace, fileMutationQueue });
    await tool.execute({ path: "CONTEXT.md", edits: [{ old_string: "old", new_string: "new" }] }, gatedContext("architect"));
    expect(readFileSync(join(workspace, "CONTEXT.md"), "utf-8")).toBe("new\n");
  });
});
