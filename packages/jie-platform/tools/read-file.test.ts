import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadFileTool } from "./read-file";
import { JiePlatformError } from "../types";
import { makeEmptyContext } from "./_test-context";

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
    const details = result.details as { truncated: { content: boolean } };
    expect(details.truncated.content).toBe(true);
  });

  test("non-UTF-8 bytes -> unsupported_encoding", async () => {
    writeFileSync(join(workspace, "bad.bin"), Buffer.from([0xff, 0xfe, 0xfd]));
    const tool = createReadFileTool({ workspaceRoot: workspace });
    let caught: unknown;
    try {
      await tool.execute({ path: "bad.bin" }, makeEmptyContext());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("UNSUPPORTED_ENCODING");
  });

  test("path outside the workspace -> path_escape", async () => {
    const tool = createReadFileTool({ workspaceRoot: workspace });
    let caught: unknown;
    try {
      await tool.execute({ path: "/etc/passwd" }, makeEmptyContext());
    } catch (error) {
      caught = error;
    }
    expect((caught as JiePlatformError).code).toBe("PATH_ESCAPE");
  });

  test("missing file -> file_not_found", async () => {
    const tool = createReadFileTool({ workspaceRoot: workspace });
    let caught: unknown;
    try {
      await tool.execute({ path: "missing.txt" }, makeEmptyContext());
    } catch (error) {
      caught = error;
    }
    expect((caught as JiePlatformError).code).toBe("FILE_NOT_FOUND");
  });

  test("path is a directory -> is_a_directory", async () => {
    mkdirSync(join(workspace, "subdir"));
    const tool = createReadFileTool({ workspaceRoot: workspace });
    let caught: unknown;
    try {
      await tool.execute({ path: "subdir" }, makeEmptyContext());
    } catch (error) {
      caught = error;
    }
    expect((caught as JiePlatformError).code).toBe("IS_A_DIRECTORY");
  });
});
