import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JiePlatformError } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";

describe("resolveWithinWorkspace", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-path-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("resolves a relative path within the workspace", () => {
    const result = resolveWithinWorkspace("src/main.ts", workspace);
    expect(result.realPath).toBe(join(workspace, "src", "main.ts"));
    expect(result.relativePath).toBe(join("src", "main.ts"));
  });

  test("resolves an absolute path within the workspace", () => {
    const abs = join(workspace, "src", "main.ts");
    const result = resolveWithinWorkspace(abs, workspace);
    expect(result.realPath).toBe(abs);
    expect(result.relativePath).toBe(join("src", "main.ts"));
  });

  test("rejects an absolute path outside the workspace", () => {
    expect(() => resolveWithinWorkspace("/tmp", workspace)).toThrow(JiePlatformError);
  });

  test("rejects a relative path that escapes the workspace", () => {
    expect(() => resolveWithinWorkspace("../escape", workspace)).toThrow(JiePlatformError);
  });

  test("rejects a symlink that points outside the workspace", () => {
    const outside = mkdtempSync(join(tmpdir(), "jie-out-"));
    try {
      const inside = join(workspace, "link");
      symlinkSync(outside, inside);
      expect(() => resolveWithinWorkspace("link", workspace)).toThrow(JiePlatformError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("resolves a nested file path with missing parent directories", () => {
    const result = resolveWithinWorkspace("a/b/c/file.txt", workspace);
    expect(result.realPath).toBe(join(workspace, "a", "b", "c", "file.txt"));
  });
});

describe("mapErrno", () => {
  test("maps a matching errno code to a JiePlatformError", () => {
    const err = Object.assign(new Error("no such file"), { code: "ENOENT" });
    const mapped = mapErrno(err, { ENOENT: "FILE_NOT_FOUND" });
    expect(mapped).toBeInstanceOf(JiePlatformError);
    expect((mapped as JiePlatformError).code).toBe("FILE_NOT_FOUND");
  });

  test("passes through an unmapped Error as-is", () => {
    const err = new Error("plain error");
    const mapped = mapErrno(err, {});
    expect(mapped).toBe(err);
  });

  test("wraps a non-Error value in an Error", () => {
    const mapped = mapErrno("bad thing", { ENOENT: "FILE_NOT_FOUND" });
    expect(mapped).toBeInstanceOf(Error);
    expect(mapped.message).toBe("bad thing");
  });
});
