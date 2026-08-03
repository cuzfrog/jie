import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWriteFileTool } from "./write-file";
import { makeEmptyContext } from "./_test-context";

describe("write_file", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-write-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("writes a file; LLM content reports bytes written", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "hello" },
      makeEmptyContext(),
    );
    expect(result.content).toBe("Successfully wrote 5 bytes to a.txt");
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("hello");
  });

  test("multi-byte content reports UTF-8 bytes, not UTF-16 length", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "你好" },
      makeEmptyContext(),
    );
    expect(result.content).toBe("Successfully wrote 6 bytes to a.txt");
    expect(result.details).toMatchObject({ bytesWritten: 6 });
  });

  test("overwrites an existing file (idempotent)", async () => {
    writeFileSync(join(workspace, "a.txt"), "old");
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    await tool.execute({ path: "a.txt", content: "new" }, makeEmptyContext());
    expect(readFileSync(join(workspace, "a.txt"), "utf-8")).toBe("new");
  });

  test("auto-creates missing parent directories", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    await tool.execute(
      { path: "deep/nested/dir/a.txt", content: "x" },
      makeEmptyContext(),
    );
    expect(existsSync(join(workspace, "deep/nested/dir/a.txt"))).toBe(true);
  });

  test("content over 5 MiB -> file_too_large", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const huge = "x".repeat(5 * 1024 * 1024 + 1);
    await expect(
      tool.execute({ path: "a.txt", content: huge }, makeEmptyContext()),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      message: `File content exceeds the maximum allowed size: ${huge.length}`,
    });
  });

  test("content exactly at 5 MiB is accepted", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const max = "x".repeat(5 * 1024 * 1024);
    const result = await tool.execute(
      { path: "a.txt", content: max },
      makeEmptyContext(),
    );
    expect(result.content).toBe(`Successfully wrote ${max.length} bytes to a.txt`);
  });

  test("path outside the workspace -> path_escape", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "/etc/cant-touch-this", content: "x" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "PATH_ESCAPE" });
  });

  test("path is a directory -> is_a_directory", async () => {
    mkdirSync(join(workspace, "subdir"));
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    await expect(
      tool.execute(
        { path: "subdir", content: "x" },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "IS_A_DIRECTORY" });
  });

  test("details carries path, bytes_written, created_at", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "hello" },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({
      path: "a.txt",
      bytesWritten: 5,
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  test("details carries the discriminator kind: 'diff'", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute({ path: "a.txt", content: "x" }, makeEmptyContext());
    expect(result.details).toMatchObject({ kind: "diff" });
  });

  test("a new file reports an all-added diff", async () => {
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "one\ntwo\n" },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ diff: "@@ -0,0 +1,2 @@\n+one\n+two" });
  });

  test("overwriting an existing file reports a unified diff of the change", async () => {
    writeFileSync(join(workspace, "a.txt"), "a\nb\nc\n");
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "a\nB\nc\n" },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ diff: "@@ -1,3 +1,3 @@\n a\n-b\n+B\n c" });
  });

  test("rewriting identical content reports an empty diff", async () => {
    writeFileSync(join(workspace, "a.txt"), "same\n");
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "same\n" },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ diff: "" });
  });

  test("overwriting a non-UTF-8 file succeeds with a null diff", async () => {
    writeFileSync(join(workspace, "a.bin"), new Uint8Array([0xff, 0xfe, 0x00, 0x01]));
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.bin", content: "text now" },
      makeEmptyContext(),
    );
    expect(readFileSync(join(workspace, "a.bin"), "utf-8")).toBe("text now");
    expect(result.details).toMatchObject({ diff: null });
  });

  test("overwriting a file beyond the diff line cap reports a null diff", async () => {
    const big = Array.from({ length: 6_000 }, (_, i) => `line ${i}`).join("\n");
    writeFileSync(join(workspace, "big.txt"), big);
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "big.txt", content: `${big}\nnew line` },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ diff: null });
  });

  test("the LLM content stays the summary line without the diff", async () => {
    writeFileSync(join(workspace, "a.txt"), "old\n");
    const tool = createWriteFileTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { path: "a.txt", content: "new\n" },
      makeEmptyContext(),
    );
    expect(result.content).toBe("Successfully wrote 4 bytes to a.txt");
  });
});
