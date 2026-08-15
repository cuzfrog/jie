import { QueueIndicatorImpl } from "./queue-indicator";

const queueIndicator = new QueueIndicatorImpl();

function entry(text: string): { text: string; source: "user" | "peer" } {
  return { text, source: "user" };
}

describe("QueueIndicatorImpl", () => {
  test("returns null for empty or null queue", () => {
    expect(queueIndicator.format(null)).toBeNull();
    expect(queueIndicator.format([])).toBeNull();
  });

  test("singular form for one prompt", () => {
    expect(queueIndicator.format([entry("hi")])).toBe("1 prompt queued  > hi");
  });

  test("plural form for multiple prompts", () => {
    expect(queueIndicator.format([entry("a"), entry("b")])).toBe("2 prompts queued  > a");
  });

  test("flattens newlines so the indicator stays on one line", () => {
    expect(queueIndicator.format([entry("first\nsecond\r\nthird")])).toBe("1 prompt queued  > first second third");
  });

  test("truncates long previews", () => {
    const long = "x".repeat(200);
    const out = queueIndicator.format([entry(long)]);
    expect(out).not.toBeNull();
    expect(out?.endsWith("…")).toBe(true);
  });

  test("preview slice is exactly QUEUE_PREVIEW_MAX_CHARS wide", () => {
    const long = "x".repeat(200);
    const out = queueIndicator.format([entry(long)]);
    expect(out).not.toBeNull();
    const previewStart = out!.indexOf("> ") + 2;
    const previewEnd = out!.length - 1;
    const preview = out!.slice(previewStart, previewEnd);
    expect(preview.length).toBe(40);
    expect(out!.endsWith("…")).toBe(true);
  });

  test("does not split a surrogate pair at the cap boundary", () => {
    const filler = "x".repeat(39);
    const text = `${filler}\u{1F434}tail`;
    const out = queueIndicator.format([entry(text)]);
    expect(out).not.toBeNull();
    expect(out).toContain("\u{1F434}");
    const codeUnits = out!.split("").filter((ch) => ch !== " " && ch !== ">").join("");
    const lonely = codeUnits.match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g);
    expect(lonely).toBeNull();
  });
});
