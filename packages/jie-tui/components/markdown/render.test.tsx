import { render } from "../../test-renderer";
import { Markdown } from "./render";

function frameOf(source: string): string {
  const out = render(<Markdown source={source} />);
  return out.lastFrame() ?? "";
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

describe("Markdown", () => {
  test("renders a plain paragraph as text", () => {
    const f = frameOf("hello world");
    expect(f).toContain("hello world");
  });

  test("renders a level-1 heading with accent color and bold", () => {
    const f = stripAnsi(frameOf("# title"));
    expect(f).toMatch(/^# title/);
  });

  test("renders a level-2 heading", () => {
    const f = stripAnsi(frameOf("## subtitle"));
    expect(f).toMatch(/^## subtitle/);
  });

  test("heading prefix repeats the hash per level", () => {
    const h1 = stripAnsi(frameOf("# h1"));
    const h2 = stripAnsi(frameOf("## h2"));
    const h3 = stripAnsi(frameOf("### h3"));
    const h6 = stripAnsi(frameOf("###### h6"));
    expect(h1).toMatch(/^# h1/);
    expect(h2).toMatch(/^## h2/);
    expect(h3).toMatch(/^### h3/);
    expect(h6).toMatch(/^###### h6/);
  });

  test("renders an unordered list with bullets", () => {
    const f = frameOf("- one\n- two\n- three");
    expect(f).toContain("one");
    expect(f).toContain("two");
    expect(f).toContain("three");
  });

  test("renders inline code inside a list item via InlineRuns", () => {
    const f = stripAnsi(frameOf("- use `foo()` please"));
    expect(f).toContain("use");
    expect(f).toContain("foo()");
    expect(f).toContain("please");
    expect(f).toContain("- ");
  });

  test("renders emphasis inside a list item", () => {
    const f = stripAnsi(frameOf("- this is *italic*"));
    expect(f).toContain("this is");
    expect(f).toContain("italic");
  });

  test("renders nested list children with indent", () => {
    const f = stripAnsi(frameOf("- outer\n  - inner"));
    expect(f).toContain("outer");
    expect(f).toContain("inner");
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

  test("renders inline code inside a table cell", () => {
    const f = stripAnsi(frameOf("| cmd | desc |\n|-----|------|\n| `ls` | list |"));
    expect(f).toContain("cmd");
    expect(f).toContain("ls");
    expect(f).toContain("list");
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
      expect(f).toContain("]8;;https://x.com");
    } finally {
      if (orig === undefined) delete process.env.INK_OSC8;
      else process.env.INK_OSC8 = orig;
    }
  });

  test("javascript: link in OSC-8 mode falls back to label (href)", () => {
    const orig = process.env.INK_OSC8;
    process.env.INK_OSC8 = "1";
    try {
      const f = frameOf("[click](javascript:alert(1))");
      expect(f).toContain("click");
      expect(f).toContain("javascript:alert(1)");
      expect(f).not.toContain("]8;;javascript:");
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

describe("Markdown style override", () => {
  function stripAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;]*m/g, "");
  }

  test("textColor override recolors paragraph runs to the override", () => {
    const out = render(<Markdown source="hello" style={{ textColor: "red" }} />);
    const frame = out.lastFrame() ?? "";
    expect(frame).toContain("\x1b[31m");
  });

  test("italic override wraps paragraph runs in italic", () => {
    const out = render(<Markdown source="hello" style={{ italic: true }} />);
    const frame = out.lastFrame() ?? "";
    expect(frame).toContain("\x1b[3m");
  });

  test("code spans respect textColor override", () => {
    const out = render(<Markdown source="call `foo()`" style={{ textColor: "red" }} />);
    const frame = out.lastFrame() ?? "";
    expect(frame).toContain("foo()");
    expect(frame).toMatch(/\x1b\[31m[^\x1b]*foo\(\)/);
  });

  test("lists render through the override color", () => {
    const out = render(<Markdown source="- a\n- b" style={{ textColor: "red" }} />);
    const frame = stripAnsi(out.lastFrame() ?? "");
    expect(frame).toContain("a");
    expect(frame).toContain("b");
  });

  test("tables do not emit accent color under the override", () => {
    const out = render(
      <Markdown
        source={"| a | b |\n|---|---|\n| 1 | 2 |"}
        style={{ textColor: "red" }}
      />,
    );
    const frame = out.lastFrame() ?? "";
    expect(frame).not.toContain("\x1b[36m");
  });

  test("heading prefix renders italic when italic override is set", () => {
    const out = render(<Markdown source="# plan" style={{ italic: true }} />);
    const frame = out.lastFrame() ?? "";
    const hashIdx = frame.indexOf("#");
    expect(hashIdx).toBeGreaterThan(-1);
    const italicStart = frame.lastIndexOf("\x1b[3m", hashIdx);
    expect(italicStart).toBeGreaterThanOrEqual(0);
    const italicEnd = frame.indexOf("\x1b[23m", hashIdx);
    expect(italicEnd).toBeGreaterThan(hashIdx);
  });

  test("blockquote bar and content both render italic when italic override is set", () => {
    const out = render(
      <Markdown source="> quoted" style={{ italic: true, textColor: "gray" }} />,
    );
    const frame = out.lastFrame() ?? "";
    const barIdx = frame.indexOf("│");
    expect(barIdx).toBeGreaterThan(-1);
    const italicBeforeBar = frame.lastIndexOf("\x1b[3m", barIdx);
    expect(italicBeforeBar).toBeGreaterThanOrEqual(0);
  });

  test("blockquote defaults to italic when no style override is provided", () => {
    const out = render(<Markdown source="> quoted" />);
    const frame = out.lastFrame() ?? "";
    expect(frame).toContain("\x1b[3m");
  });
});
