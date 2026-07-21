import { filterFiles } from "./filter";

function file(path: string): { readonly path: string } {
  return { path };
}

describe("filterFiles", () => {
  test("empty query returns the input order", () => {
    const list: ReadonlyArray<{ readonly path: string }> = [file("a.ts"), file("b.ts"), file("c.ts")];
    expect(filterFiles("", list).map((f) => f.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  test("ranks prefix matches above substring matches", () => {
    const list: ReadonlyArray<{ readonly path: string }> = [
      file("src/utils.ts"),
      file("foo.ts"),
      file("packages/foo.ts"),
    ];
    expect(filterFiles("foo", list).map((f) => f.path)).toEqual(["foo.ts", "packages/foo.ts"]);
  });

  test("matches a substring case-insensitively", () => {
    const list: ReadonlyArray<{ readonly path: string }> = [file("Main.ts"), file("Other.ts")];
    expect(filterFiles("MAIN", list).map((f) => f.path)).toEqual(["Main.ts"]);
  });

  test("treats whitespace-only query as empty", () => {
    const list: ReadonlyArray<{ readonly path: string }> = [file("a"), file("b")];
    expect(filterFiles("   ", list).map((f) => f.path)).toEqual(["a", "b"]);
  });

  test("preserves order among equally-ranked candidates", () => {
    const list: ReadonlyArray<{ readonly path: string }> = [
      file("alpha/a.ts"),
      file("beta/alpha.ts"),
      file("gamma/alpha/b.ts"),
    ];
    expect(filterFiles("alpha", list).map((f) => f.path)).toEqual([
      "alpha/a.ts",
      "beta/alpha.ts",
      "gamma/alpha/b.ts",
    ]);
  });

  test("returns empty array when no path matches", () => {
    const list: ReadonlyArray<{ readonly path: string }> = [file("alpha"), file("beta")];
    expect(filterFiles("zz", list)).toEqual([]);
  });
});
