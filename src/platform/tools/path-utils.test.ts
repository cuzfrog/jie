import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JiePlatformError } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace, walkFiles } from "./path-utils";

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

describe("walkFiles", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-walk-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("yields relative posix paths for all files, pruning ignored dirs", () => {
    mkdirSync(join(workspace, "src", "util"), { recursive: true });
    writeFileSync(join(workspace, "src", "a.ts"), "");
    writeFileSync(join(workspace, "src", "util", "b.ts"), "");
    writeFileSync(join(workspace, "readme.md"), "");
    mkdirSync(join(workspace, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(workspace, "node_modules", "pkg", "index.js"), "");
    mkdirSync(join(workspace, ".git"), { recursive: true });
    writeFileSync(join(workspace, ".git", "config"), "");
    const files = [...walkFiles(workspace, undefined)].sort();
    expect(files).toEqual(["readme.md", "src/a.ts", "src/util/b.ts"]);
  });

  test("skips symlinks", () => {
    writeFileSync(join(workspace, "real.ts"), "");
    symlinkSync(join(workspace, "real.ts"), join(workspace, "link.ts"));
    const files = [...walkFiles(workspace, undefined)];
    expect(files).toContain("real.ts");
    expect(files).not.toContain("link.ts");
  });

  test("returns nothing when the signal is already aborted", () => {
    writeFileSync(join(workspace, "a.ts"), "");
    const controller = new AbortController();
    controller.abort();
    expect([...walkFiles(workspace, controller.signal)]).toEqual([]);
  });

  test("stops early when the abort signal fires mid-walk", () => {
    for (let i = 0; i < 100; i++) writeFileSync(join(workspace, `f${i}.ts`), "");
    const controller = new AbortController();
    const files: string[] = [];
    for (const f of walkFiles(workspace, controller.signal)) {
      files.push(f);
      if (files.length === 3) controller.abort();
    }
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.length).toBeLessThan(100);
  });

  test("honors a custom ignoreDirs list", () => {
    mkdirSync(join(workspace, "dist"), { recursive: true });
    writeFileSync(join(workspace, "dist", "out.js"), "");
    writeFileSync(join(workspace, "keep.ts"), "");
    const files = [...walkFiles(workspace, undefined, ["dist"])].sort();
    expect(files).toEqual(["keep.ts"]);
  });
});
