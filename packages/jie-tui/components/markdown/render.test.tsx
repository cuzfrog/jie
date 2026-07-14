import { render } from "../../test-renderer";
import { Markdown } from "./render";

function frameOf(source: string): string {
  const out = render(<Markdown source={source} />);
  return out.lastFrame() ?? "";
}

describe("Markdown", () => {
  test("renders a plain paragraph as text", () => {
    const f = frameOf("hello world");
    expect(f).toContain("hello world");
  });

  test("renders a level-1 heading with accent color and bold", () => {
    const f = frameOf("# title");
    expect(f).toContain("title");
  });

  test("renders a level-2 heading", () => {
    const f = frameOf("## subtitle");
    expect(f).toContain("subtitle");
  });

  test("renders an unordered list with bullets", () => {
    const f = frameOf("- one\n- two\n- three");
    expect(f).toContain("one");
    expect(f).toContain("two");
    expect(f).toContain("three");
  });

  test("renders an ordered list with digit prefixes", () => {
    const f = frameOf("1. alpha\n2. beta");
    expect(f).toContain("alpha");
    expect(f).toContain("beta");
  });

  test("renders a fenced code block with the language tag and preserved content", () => {
    const f = frameOf("```ts\nconst x = 1;\n```");
    expect(f).toContain("const x = 1;");
  });

  test("renders a blockquote with leading bar", () => {
    const f = frameOf("> quoted text");
    expect(f).toContain("quoted text");
  });

  test("renders a horizontal rule", () => {
    const f = frameOf("---");
    expect(f.toLowerCase()).toMatch(/[─-]{3,}/);
  });

  test("renders a pipe table with all cells", () => {
    const f = frameOf("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |");
    expect(f).toContain("a");
    expect(f).toContain("b");
    expect(f).toContain("1");
    expect(f).toContain("2");
    expect(f).toContain("3");
    expect(f).toContain("4");
  });

  test("renders inline code spans distinct from regular text", () => {
    const f = frameOf("call `foo()` please");
    expect(f).toContain("foo()");
  });

  test("renders emphasis text", () => {
    const f = frameOf("this is *italic* word");
    expect(f).toContain("italic");
  });

  test("renders strong text", () => {
    const f = frameOf("**strong** here");
    expect(f).toContain("strong");
  });

  test("renders a link in OSC-8 disabled mode as label (href)", () => {
    const orig = process.env.INK_OSC8;
    delete process.env.INK_OSC8;
    try {
      const f = frameOf("see [docs](https://x.com)");
      expect(f).toContain("docs");
      expect(f).toContain("https://x.com");
    } finally {
      if (orig === undefined) delete process.env.INK_OSC8;
      else process.env.INK_OSC8 = orig;
    }
  });

  test("renders a link in OSC-8 enabled mode with the escape sequence", () => {
    const orig = process.env.INK_OSC8;
    process.env.INK_OSC8 = "1";
    try {
      const f = frameOf("see [docs](https://x.com)");
      expect(f).toContain("]8;;https://x.com\\docs]8;;\\");
    } finally {
      if (orig === undefined) delete process.env.INK_OSC8;
      else process.env.INK_OSC8 = orig;
    }
  });

  test("renders multiple block kinds in one source", () => {
    const f = frameOf("# heading\n\n- one\n- two\n\n```ts\nconst x = 1;\n```\n");
    expect(f).toContain("heading");
    expect(f).toContain("one");
    expect(f).toContain("const x = 1;");
  });
});
