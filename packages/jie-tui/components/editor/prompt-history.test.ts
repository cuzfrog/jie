import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPromptHistoryStore } from "./prompt-history";

describe("createPromptHistoryStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "jie-prompt-history-"));
    filePath = join(dir, "prompt-history.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("load returns empty when the file does not exist", () => {
    expect(createPromptHistoryStore(filePath).load()).toEqual([]);
  });

  test("append then load round-trips in chronological order", () => {
    const store = createPromptHistoryStore(filePath);
    store.append("first");
    store.append("second");
    expect(createPromptHistoryStore(filePath).load()).toEqual(["first", "second"]);
  });

  test("multi-line prompts survive JSON escaping", () => {
    const store = createPromptHistoryStore(filePath);
    store.append("line1\nline2");
    expect(createPromptHistoryStore(filePath).load()).toEqual(["line1\nline2"]);
  });

  test("load skips malformed lines and entries without a prompt string", () => {
    writeFileSync(filePath, `{"prompt":"good"}\nnot json\n{"other":1}\n{"prompt":""}\n42\n`);
    expect(createPromptHistoryStore(filePath).load()).toEqual(["good"]);
  });

  test("load truncates the file to the last entries when over the cap", () => {
    writeFileSync(filePath, Array.from({ length: 600 }, (_x, i) => JSON.stringify({ prompt: `p${i}` })).join("\n") + "\n");
    const loaded = createPromptHistoryStore(filePath).load();
    expect(loaded).toHaveLength(500);
    expect(loaded[0]).toBe("p100");
    expect(loaded[499]).toBe("p599");
    const remaining = readFileSync(filePath, "utf8").trim().split("\n");
    expect(remaining).toHaveLength(500);
  });

  test("append creates parent directories when missing", () => {
    const nested = join(dir, "nested", "deeper", "history.jsonl");
    createPromptHistoryStore(nested).append("hello");
    expect(createPromptHistoryStore(nested).load()).toEqual(["hello"]);
  });
});
