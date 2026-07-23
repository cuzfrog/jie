import { jieMarkdownTheme, style } from "./themes";

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
