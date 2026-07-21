import { formatQueueIndicator, jieMarkdownTheme, style } from "./themes";

describe("style", () => {
  test("wraps text in the named color's SGR codes with a foreground reset", () => {
    expect(style("error")("boom")).toBe("\x1b[31mboom\x1b[39m");
    expect(style("accent")("hi")).toBe("\x1b[36mhi\x1b[39m");
    expect(style("muted")("x")).toBe("\x1b[90mx\x1b[39m");
  });

  test("every color name yields a styling function", () => {
    const names = ["accent", "border", "borderMuted", "success", "error", "warning", "muted", "dim", "text", "thinkingText", "userMessageIcon", "assistantMessageIcon", "toolTitle", "toolOutput"] as const;
    for (const name of names) {
      const styled = style(name)("t");
      expect(styled.startsWith("\x1b[")).toBe(true);
      expect(styled.endsWith("\x1b[39m")).toBe(true);
      expect(styled).toContain("t");
    }
  });
});

describe("jieMarkdownTheme", () => {
  test("maps markdown elements onto the palette colors", () => {
    const theme = jieMarkdownTheme();
    expect(theme.link("x")).toBe("\x1b[36mx\x1b[39m");
    expect(theme.linkUrl("x")).toBe("\x1b[90mx\x1b[39m");
    expect(theme.code("x")).toBe("\x1b[33mx\x1b[39m");
    expect(theme.listBullet("x")).toBe("\x1b[36mx\x1b[39m");
    expect(theme.quoteBorder("x")).toBe("\x1b[90mx\x1b[39m");
  });

  test("heading combines the accent color with bold", () => {
    expect(jieMarkdownTheme().heading("T")).toBe("\x1b[36m\x1b[1mT\x1b[22m\x1b[39m");
  });

  test("inline emphasis helpers toggle single SGR attributes", () => {
    const theme = jieMarkdownTheme();
    expect(theme.bold("x")).toBe("\x1b[1mx\x1b[22m");
    expect(theme.italic("x")).toBe("\x1b[3mx\x1b[23m");
    expect(theme.underline("x")).toBe("\x1b[4mx\x1b[24m");
    expect(theme.strikethrough("x")).toBe("\x1b[9mx\x1b[29m");
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

  test("preview slice is exactly QUEUE_PREVIEW_MAX_CHARS wide", () => {
    const long = "x".repeat(200);
    const out = formatQueueIndicator([long]);
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
    const out = formatQueueIndicator([text]);
    expect(out).not.toBeNull();
    expect(out).toContain("\u{1F434}");
    const codeUnits = out!.split("").filter((ch) => ch !== " " && ch !== ">").join("");
    const lonely = codeUnits.match(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g);
    expect(lonely).toBeNull();
  });
});
