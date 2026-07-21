import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJieAutocompleteProvider } from "./jie-autocomplete";

function signal(): AbortSignal {
  return new AbortController().signal;
}

describe("createJieAutocompleteProvider — @-mentions", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-ac-"));
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "main.ts"), "export const x = 1;\n");
    writeFileSync(join(dir, "src", "helper.ts"), "export const y = 2;\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("@query resolves matching project files with @-prefixed values", async () => {
    const suggestions = await createJieAutocompleteProvider(dir).getSuggestions(["@mai"], 0, 4, { signal: signal() });
    expect(suggestions).not.toBeNull();
    expect(suggestions!.prefix).toBe("@mai");
    expect(suggestions!.items[0]).toEqual({ value: "@src/main.ts", label: "src/main.ts" });
  });

  test("@ with no match returns null", async () => {
    expect(await createJieAutocompleteProvider(dir).getSuggestions(["@zzz"], 0, 4, { signal: signal() })).toBeNull();
  });

  test("@ mid-line after a space still triggers", async () => {
    const suggestions = await createJieAutocompleteProvider(dir).getSuggestions(["look at @hel"], 0, 12, { signal: signal() });
    expect(suggestions!.items[0]!.value).toBe("@src/helper.ts");
  });

  test("applyCompletion replaces the @ token with the resolved path and a trailing space", () => {
    const result = createJieAutocompleteProvider(dir)
      .applyCompletion(["@mai"], 0, 4, { value: "@src/main.ts", label: "src/main.ts" }, "@mai");
    expect(result.lines).toEqual(["@src/main.ts "]);
    expect(result.cursorCol).toBe(13);
  });
});

describe("createJieAutocompleteProvider — slash commands", () => {
  test("/query filters jie slash commands", async () => {
    const suggestions = await createJieAutocompleteProvider("/tmp").getSuggestions(["/he"], 0, 3, { signal: signal() });
    expect(suggestions!.prefix).toBe("/he");
    expect(suggestions!.items.map((item) => item.value)).toContain("help");
  });

  test("slash completion appends the command name and a trailing space", () => {
    const result = createJieAutocompleteProvider("/tmp")
      .applyCompletion(["/he"], 0, 3, { value: "help", label: "help" }, "/he");
    expect(result.lines).toEqual(["/help "]);
    expect(result.cursorCol).toBe(6);
  });

  test("plain text yields no suggestions", async () => {
    expect(await createJieAutocompleteProvider("/tmp").getSuggestions(["hello"], 0, 5, { signal: signal() })).toBeNull();
  });
});
