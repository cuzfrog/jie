import { renderUnifiedDiff } from "./unified-diff";

describe("renderUnifiedDiff", () => {
  test("emits exact unified-diff format for a small change", () => {
    expect(renderUnifiedDiff("a\nb\nc\n", "a\nB\nc\n")).toBe("@@ -1,3 +1,3 @@\n a\n-b\n+B\n c");
  });

  test("returns an empty string when the contents are identical", () => {
    expect(renderUnifiedDiff("a\nb\n", "a\nb\n")).toBe("");
  });

  test("returns an empty string for two empty contents", () => {
    expect(renderUnifiedDiff("", "")).toBe("");
  });

  test("a new file renders as one all-added hunk", () => {
    expect(renderUnifiedDiff("", "x\ny\n")).toBe("@@ -1,0 +1,2 @@\n+x\n+y");
  });

  test("a deleted file renders as one all-deleted hunk", () => {
    expect(renderUnifiedDiff("x\ny\n", "")).toBe("@@ -1,2 +1,0 @@\n-x\n-y");
  });

  test("content without a trailing newline diffs by line", () => {
    expect(renderUnifiedDiff("a\nb", "a\nB")).toBe("@@ -1,2 +1,2 @@\n a\n-b\n+B");
  });

  test("nearby changes merge into a single hunk", () => {
    const diff = renderUnifiedDiff("a\nb\nc\n", "a\nB\nc\n");
    expect((diff?.match(/^@@/gm) ?? []).length).toBe(1);
  });

  test("distant changes produce separate hunks", () => {
    const before = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
    const after = before.replace("line 0", "LINE 0").replace("line 19", "LINE 19");
    const diff = renderUnifiedDiff(before, after);
    expect((diff?.match(/^@@/gm) ?? []).length).toBe(2);
  });

  test("returns null when the old content exceeds the line cap", () => {
    const big = Array.from({ length: 5_001 }, (_, i) => `line ${i}`).join("\n");
    expect(renderUnifiedDiff(big, `${big}\nnew`)).toBeNull();
  });

  test("returns null when the new content exceeds the line cap", () => {
    const big = Array.from({ length: 5_001 }, (_, i) => `line ${i}`).join("\n");
    expect(renderUnifiedDiff("small", big)).toBeNull();
  });
});
