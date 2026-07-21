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

  test("respects simple .gitignore patterns", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "ignored.ts\nbuild/\n");
      writeFileSync(join(dir, "ignored.ts"), "x");
      mkdirSync(join(dir, "build"));
      writeFileSync(join(dir, "build", "out.ts"), "x");
      writeFileSync(join(dir, "kept.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("ignored.ts");
      expect(rels.some((r) => r.startsWith("build/"))).toBe(false);
      expect(rels).toContain("kept.ts");
    } finally {
      teardown(dir);
    }
  });

  test("respects gitignore glob patterns with *", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "*.log\n");
      writeFileSync(join(dir, "app.log"), "x");
      writeFileSync(join(dir, "app.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("app.log");
      expect(rels).toContain("app.ts");
    } finally {
      teardown(dir);
    }
  });

  test("respects gitignore anchored patterns", () => {
    const dir = setup();
    try {
      mkdirSync(join(dir, "tmpA"));
      writeFileSync(join(dir, ".gitignore"), "/tmpA/\n");
      writeFileSync(join(dir, "tmpA.ts"), "x");
      writeFileSync(join(dir, "tmpA", "out.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).toContain("tmpA.ts");
      expect(rels.some((r) => r.startsWith("tmpA/"))).toBe(false);
    } finally {
      teardown(dir);
    }
  });

  test("respects gitignore negation", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "*.ts\n!keep.ts\n");
      writeFileSync(join(dir, "main.ts"), "x");
      writeFileSync(join(dir, "keep.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("main.ts");
      expect(rels).toContain("keep.ts");
    } finally {
      teardown(dir);
    }
  });

  test("does not throw on malformed .gitignore patterns", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "[abc\n");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).toContain("src/main.ts");
    } finally {
      teardown(dir);
    }
  });

  test("**/foo pattern also matches foo with zero intermediate directories", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "**/foo\n");
      writeFileSync(join(dir, "foo"), "x");
      mkdirSync(join(dir, "a"));
      writeFileSync(join(dir, "a", "foo"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("foo");
      expect(rels).not.toContain("a/foo");
    } finally {
      teardown(dir);
    }
  });

  test("nested .gitignore patterns apply to files below the directory", () => {
    const dir = setup();
    try {
      mkdirSync(join(dir, "a", "b"), { recursive: true });
      writeFileSync(join(dir, "a", ".gitignore"), "down.txt\n");
      writeFileSync(join(dir, "a", "down.txt"), "x");
      writeFileSync(join(dir, "a", "b", "down.txt"), "x");
      writeFileSync(join(dir, "a", "b", "kept.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("a/down.txt");
      expect(rels).not.toContain("a/b/down.txt");
      expect(rels).toContain("a/b/kept.ts");
    } finally {
      teardown(dir);
    }
  });

  test("respects negated character class [!...]", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "[!ch].txt\n");
      writeFileSync(join(dir, "c.txt"), "x");
      writeFileSync(join(dir, "h.txt"), "x");
      writeFileSync(join(dir, "b.txt"), "x");
      writeFileSync(join(dir, "a.txt"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).toContain("c.txt");
      expect(rels).toContain("h.txt");
      expect(rels).not.toContain("b.txt");
      expect(rels).not.toContain("a.txt");
    } finally {
      teardown(dir);
    }
  });

  test("escaped \\* in .gitignore matches a literal asterisk filename", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "\\*\n");
      writeFileSync(join(dir, "*"), "x");
      writeFileSync(join(dir, "star.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("*");
      expect(rels).toContain("star.ts");
    } finally {
      teardown(dir);
    }
  });

  test("multi-segment literal prefix in .gitignore matches files inside that directory", () => {
    const dir = setup();
    try {
      mkdirSync(join(dir, "outdir"));
      writeFileSync(join(dir, ".gitignore"), "outdir/*.txt\n");
      writeFileSync(join(dir, "outdir", "main.txt"), "x");
      writeFileSync(join(dir, "outdir", "deep.txt"), "x");
      writeFileSync(join(dir, "kept.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("outdir/main.txt");
      expect(rels).not.toContain("outdir/deep.txt");
      expect(rels).toContain("kept.ts");
    } finally {
      teardown(dir);
    }
  });

  test("empty .gitignore does not change results", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "");
      const rels = scanFiles(dir).map((f) => f.relPath).sort();
      expect(rels).toContain("src/main.ts");
      expect(rels).toContain("src/utils/helper.ts");
    } finally {
      teardown(dir);
    }
  });

  test(".gitignore with CRLF line endings is parsed correctly", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "ignored.ts\r\nbuild/\r\n");
      writeFileSync(join(dir, "ignored.ts"), "x");
      mkdirSync(join(dir, "build"));
      writeFileSync(join(dir, "build", "out.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("ignored.ts");
      expect(rels.some((r) => r.startsWith("build/"))).toBe(false);
    } finally {
      teardown(dir);
    }
  });

  test(".gitignore with only whitespace and comments is a no-op", () => {
    const dir = setup();
    try {
      writeFileSync(join(dir, ".gitignore"), "\n   \n# a comment\n#another\n\n");
      const rels = scanFiles(dir).map((f) => f.relPath).sort();
      expect(rels).toContain("src/main.ts");
    } finally {
      teardown(dir);
    }
  });

  test("nested .gitignore pattern does not bleed into sibling directories", () => {
    const dir = setup();
    try {
      mkdirSync(join(dir, "a"));
      mkdirSync(join(dir, "b"));
      writeFileSync(join(dir, "a", ".gitignore"), "secret.ts\n");
      writeFileSync(join(dir, "a", "secret.ts"), "x");
      writeFileSync(join(dir, "b", "secret.ts"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("a/secret.ts");
      expect(rels).toContain("b/secret.ts");
    } finally {
      teardown(dir);
    }
  });

  test("inner **/foo pattern from nested .gitignore does not leak to siblings", () => {
    const dir = setup();
    try {
      mkdirSync(join(dir, "a"));
      mkdirSync(join(dir, "a", "deep"));
      mkdirSync(join(dir, "other"));
      writeFileSync(join(dir, "a", ".gitignore"), "**/secret.txt\n");
      writeFileSync(join(dir, "a", "secret.txt"), "x");
      writeFileSync(join(dir, "a", "deep", "secret.txt"), "x");
      writeFileSync(join(dir, "other", "secret.txt"), "x");
      const rels = scanFiles(dir).map((f) => f.relPath);
      expect(rels).not.toContain("a/secret.txt");
      expect(rels).not.toContain("a/deep/secret.txt");
      expect(rels).toContain("other/secret.txt");
    } finally {
      teardown(dir);
    }
  });
});
