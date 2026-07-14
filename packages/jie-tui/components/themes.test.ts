import { formatQueueIndicator, pickColor, railWidth } from "./themes";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("pickColor", () => {
  test("returns the named color from COLORS", () => {
    expect(pickColor("accent")).toBe("cyan");
    expect(pickColor("error")).toBe("red");
    expect(pickColor("muted")).toBe("gray");
  });
});

describe("railWidth", () => {
  test("returns a width between 12 and floor(cols*0.25) on small terminals", () => {
    const w = railWidth(60);
    expect(w).toBeGreaterThanOrEqual(12);
    expect(w).toBeLessThanOrEqual(Math.floor(60 * 0.25));
  });

  test("returns a width between 15 and 24 on large terminals", () => {
    const w = railWidth(120);
    expect(w).toBeGreaterThanOrEqual(15);
    expect(w).toBeLessThanOrEqual(24);
  });
});

describe("formatQueueIndicator", () => {
  test("returns null for empty or null queue", () => {
    expect(formatQueueIndicator(null)).toBeNull();
    expect(formatQueueIndicator([])).toBeNull();
  });

  test("singular form for one prompt", () => {
    expect(formatQueueIndicator(["hi"])).toBe("1 prompt queued  > hi");
  });

  test("plural form for multiple prompts", () => {
    expect(formatQueueIndicator(["a", "b"])).toBe("2 prompts queued  > a");
  });

  test("truncates long previews", () => {
    const long = "x".repeat(200);
    const out = formatQueueIndicator([long]);
    expect(out).not.toBeNull();
    expect(out?.endsWith("…")).toBe(true);
  });

  test("preview cap keeps the footer row within ~60 chars on narrow terminals", () => {
    const long = "x".repeat(200);
    const out = formatQueueIndicator([long]);
    expect(out).not.toBeNull();
    const previewStart = out!.indexOf("> ") + 2;
    const previewEnd = out!.length - 1;
    const preview = out!.slice(previewStart, previewEnd);
    expect(preview.length).toBeLessThanOrEqual(50);
  });
});
