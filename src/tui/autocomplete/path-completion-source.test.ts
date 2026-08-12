import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PathCompletionSource } from "./path-completion-source";
import { signal } from "./_test-fixtures";

describe("PathCompletionSource", () => {
  test("plain text yields no suggestions", async () => {
    const suggestions = await new PathCompletionSource("/tmp").getSuggestions(["hello"], 0, 5, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("lists files in a temporary directory", async () => {
    let tempDir: string | undefined;
    try {
      tempDir = mkdtempSync(join(tmpdir(), "path-completion-XXXXXX"));
      writeFileSync(join(tempDir, "foo.txt"), "hello");
      writeFileSync(join(tempDir, "bar.txt"), "world");

      const result = await new PathCompletionSource(tempDir).getSuggestions(["cat "], 0, 4, { signal: signal() });

      expect(result).not.toBeNull();
      expect(result!.items.map((item) => item.value).sort()).toEqual(["bar.txt", "foo.txt"]);
    } finally {
      if (tempDir !== undefined) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });
});
