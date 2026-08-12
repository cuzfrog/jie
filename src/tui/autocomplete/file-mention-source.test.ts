import { FileMentionSource } from "./file-mention-source";
import { CWD, scanFixture, signal } from "./_test-fixtures";

describe("FileMentionSource", () => {
  test("@query resolves matching project files with @-prefixed values", async () => {
    const suggestions = await new FileMentionSource(CWD, scanFixture).getSuggestions(["@mai"], 0, 4, { signal: signal() });
    expect(suggestions).not.toBeNull();
    expect(suggestions!.prefix).toBe("@mai");
    expect(suggestions!.items[0]).toEqual({ value: "@src/main.ts", label: "src/main.ts" });
  });

  test("@ with no match returns null", async () => {
    const suggestions = await new FileMentionSource(CWD, scanFixture).getSuggestions(["@zzz"], 0, 4, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("@ mid-line after a space still triggers", async () => {
    const suggestions = await new FileMentionSource(CWD, scanFixture).getSuggestions(["look at @hel"], 0, 12, { signal: signal() });
    expect(suggestions!.items[0]!.value).toBe("@src/helper.ts");
  });
});
