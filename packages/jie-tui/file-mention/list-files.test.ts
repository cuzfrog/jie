import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanFiles } from "./list-files";

function setup(): string {
  const dir = mkdtempSync(join(tmpdir(), "file-mention-"));
  mkdirSync(join(dir, "src"));
  mkdirSync(join(dir, "src", "utils"));
  mkdirSync(join(dir, ".git"));
  mkdirSync(join(dir, "node_modules"));
  writeFileSync(join(dir, "src", "main.ts"), "x");
  writeFileSync(join(dir, "src", "utils", "helper.ts"), "x");
  writeFileSync(join(dir, ".git", "ignored.ts"), "x");
  writeFileSync(join(dir, "node_modules", "foo.ts"), "x");
  return dir;
}

function teardown(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe("scanFiles", () => {
  test("returns files under rootDir with relPath and absPath", () => {
    const dir = setup();
    try {
      const result = scanFiles(dir);
      const rels = result.map((f) => f.relPath).sort();
      expect(rels).toContain("src/main.ts");
      expect(rels).toContain("src/utils/helper.ts");
    } finally {
      teardown(dir);
    }
  });

  test("skips .git and node_modules directories", () => {
    const dir = setup();
    try {
      const result = scanFiles(dir);
      const rels = result.map((f) => f.relPath);
      expect(rels.some((r) => r.startsWith(".git/"))).toBe(false);
      expect(rels.some((r) => r.startsWith("node_modules/"))).toBe(false);
    } finally {
      teardown(dir);
    }
  });

  test("skips hidden dotfiles and dot-dirs at any depth", () => {
    const dir = setup();
    try {
      mkdirSync(join(dir, "src", ".cache"));
      writeFileSync(join(dir, "src", ".cache", "secret.ts"), "x");
      writeFileSync(join(dir, "src", ".hidden.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels.some((r) => r.includes(".cache"))).toBe(false);
      expect(rels.some((r) => r.includes(".hidden.ts"))).toBe(false);
    } finally {
      teardown(dir);
    }
  });

  test("does not follow symlinks", () => {
    const dir = setup();
    try {
      symlinkSync(join(dir, "src"), join(dir, "src-link"), "dir");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels.some((r) => r.startsWith("src-link/"))).toBe(false);
    } finally {
      teardown(dir);
    }
  });

  test("returns empty array for a missing root", () => {
    expect(scanFiles("/tmp/does-not-exist-jie-zz-12345")).toEqual([]);
  });
});
