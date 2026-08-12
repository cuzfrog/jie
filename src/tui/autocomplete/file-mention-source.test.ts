import { FileMentionSource } from "./file-mention-source";
import { CWD, signal } from "./_test-fixtures";
import type { ScannedFile } from "./list-files";

function files(...paths: string[]): (_rootDir: string) => ReadonlyArray<ScannedFile> {
  return (_rootDir) => paths.map((relPath) => ({ absPath: `${CWD}/${relPath}`, relPath }));
}

describe("FileMentionSource", () => {
  test("@query resolves matching project files with @-prefixed values", async () => {
    const suggestions = await new FileMentionSource(CWD, files("src/main.ts", "src/helper.ts")).getSuggestions(
      ["@mai"],
      0,
      4,
      { signal: signal() },
    );
    expect(suggestions).not.toBeNull();
    expect(suggestions!.prefix).toBe("@mai");
    expect(suggestions!.items[0]).toEqual({ value: "@src/main.ts", label: "src/main.ts" });
  });

  test("@ with no match returns null", async () => {
    const suggestions = await new FileMentionSource(CWD, files("src/main.ts", "src/helper.ts")).getSuggestions(
      ["@zzz"],
      0,
      4,
      { signal: signal() },
    );
    expect(suggestions).toBeNull();
  });

  test("@ mid-line after a space still triggers", async () => {
    const suggestions = await new FileMentionSource(CWD, files("src/main.ts", "src/helper.ts")).getSuggestions(
      ["look at @hel"],
      0,
      12,
      { signal: signal() },
    );
    expect(suggestions!.items[0]!.value).toBe("@src/helper.ts");
  });

  test("empty @ query returns files in input order", async () => {
    const suggestions = await new FileMentionSource(CWD, files("a.ts", "b.ts", "c.ts")).getSuggestions(
      ["@"],
      0,
      1,
      { signal: signal() },
    );
    expect(suggestions!.items.map((item) => item.label)).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  test("ranks exact matches above prefix matches above substring matches", async () => {
    const suggestions = await new FileMentionSource(
      CWD,
      files("foo", "foo.ts", "src/utils.ts", "packages/foo.ts"),
    ).getSuggestions(["@foo"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.label)).toEqual(["foo", "foo.ts", "packages/foo.ts"]);
  });

  test("matches are case-insensitive", async () => {
    const suggestions = await new FileMentionSource(CWD, files("Main.ts", "other.ts")).getSuggestions(
      ["@MAIN"],
      0,
      5,
      { signal: signal() },
    );
    expect(suggestions!.items.map((item) => item.label)).toEqual(["Main.ts"]);
  });

  test("preserves input order among equally-ranked candidates", async () => {
    const suggestions = await new FileMentionSource(
      CWD,
      files("alpha/a.ts", "beta/alpha.ts", "gamma/alpha/b.ts"),
    ).getSuggestions(["@alpha"], 0, 6, { signal: signal() });
    expect(suggestions!.items.map((item) => item.label)).toEqual(["alpha/a.ts", "beta/alpha.ts", "gamma/alpha/b.ts"]);
  });

  test("caps suggestions at MAX_SUGGESTIONS", async () => {
    const suggestions = await new FileMentionSource(CWD, files(...Array.from({ length: 30 }, (_, i) => `${i}.ts`))).getSuggestions(
      ["@"],
      0,
      1,
      { signal: signal() },
    );
    expect(suggestions!.items.length).toBe(20);
  });
});
