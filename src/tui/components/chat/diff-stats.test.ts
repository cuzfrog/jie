import { diffStats } from "./diff-stats";

describe("diffStats", () => {
  test("counts added and removed lines", () => {
    expect(diffStats("@@ -1,2 +1,2 @@\n-foo\n+bar\n baz")).toEqual({ added: 1, removed: 1 });
  });

  test("counts multiple hunks", () => {
    expect(diffStats("@@ -1,1 +1,1 @@\n-a\n+A\n@@ -5,1 +5,1 @@\n-b\n+B")).toEqual({ added: 2, removed: 2 });
  });

  test("ignores hunk headers and context lines", () => {
    expect(diffStats("@@ -1,3 +1,3 @@\n a\n-b\n+B\n c")).toEqual({ added: 1, removed: 1 });
  });

  test("returns zeros for an empty diff", () => {
    expect(diffStats("")).toEqual({ added: 0, removed: 0 });
  });
});
