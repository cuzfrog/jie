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
    const details = result.details as {
      path: string;
      bytesWritten: number;
      createdAt: string;
    };
    expect(details.path).toBe("a.txt");
    expect(details.bytesWritten).toBe(5);
    expect(typeof details.createdAt).toBe("string");
    expect(new Date(details.createdAt).getTime()).toBeGreaterThan(0);
  });
});
