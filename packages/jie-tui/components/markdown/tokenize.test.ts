import { tokenize, type MarkdownBlock } from "./tokenize";

function kinds(blocks: ReadonlyArray<MarkdownBlock>): string[] {
  return blocks.map((b) => b.kind);
}

function first<T extends MarkdownBlock["kind"]>(
  blocks: ReadonlyArray<MarkdownBlock>,
  kind: T,
): Extract<MarkdownBlock, { kind: T }> {
  const b = blocks[0];
  if (b === undefined || b.kind !== kind) {
    throw new Error(`expected first block to be kind=${kind}, got ${b?.kind}`);
  }
  return b as Extract<MarkdownBlock, { kind: T }>;
}

describe("tokenize", () => {
  test("empty source yields no blocks", () => {
    expect(tokenize("")).toEqual([]);
  });

  test("whitespace-only source yields no blocks", () => {
    expect(tokenize("   \n\n  \n")).toEqual([]);
  });

  test("a single line is a paragraph", () => {
    const blocks = tokenize("hello world");
    expect(kinds(blocks)).toEqual(["paragraph"]);
    expect(first(blocks, "paragraph").text).toBe("hello world");
  });

  test("adjacent non-blank lines merge into one paragraph", () => {
    const blocks = tokenize("line1\nline2");
    expect(blocks).toHaveLength(1);
    expect(first(blocks, "paragraph").text).toBe("line1 line2");
  });

  test("blank line separates paragraphs", () => {
    const blocks = tokenize("a\n\nb");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.kind).toBe("paragraph");
    expect(blocks[1]?.kind).toBe("paragraph");
    if (blocks[0]?.kind !== "paragraph" || blocks[1]?.kind !== "paragraph") throw new Error("expected two paragraphs");
    expect(blocks[0].text).toBe("a");
    expect(blocks[1].text).toBe("b");
  });

  test("ATX heading # through ###### are recognized", () => {
    const blocks = tokenize("# title\n\nbody");
    expect(kinds(blocks)).toEqual(["heading", "paragraph"]);
    const h = first(blocks, "heading");
    expect(h.level).toBe(1);
    expect(h.text).toBe("title");
  });

  test("heading level tracks hash count", () => {
    const blocks = tokenize("### third\n");
    expect(first(blocks, "heading").level).toBe(3);
  });

  test("hash inside paragraph is literal, not a heading", () => {
    const blocks = tokenize("not a # heading if not at line start\n");
    expect(first(blocks, "paragraph").kind).toBe("paragraph");
  });

  test("setext heading === promoted from paragraph", () => {
    const blocks = tokenize("title\n===\n\nbody");
    expect(kinds(blocks)).toEqual(["heading", "paragraph"]);
    expect(first(blocks, "heading").level).toBe(1);
  });

  test("setext heading --- promoted from paragraph", () => {
    const blocks = tokenize("title\n---\n");
    expect(kinds(blocks)).toEqual(["heading"]);
    expect(first(blocks, "heading").level).toBe(2);
  });

  test("--- is a horizontal rule when not under a paragraph", () => {
    const blocks = tokenize("a\n\n---\n\nb");
    expect(kinds(blocks)).toEqual(["paragraph", "hr", "paragraph"]);
  });

  test("*** and ___ are also horizontal rules", () => {
    expect(kinds(tokenize("***"))).toEqual(["hr"]);
    expect(kinds(tokenize("___"))).toEqual(["hr"]);
  });

  test("fenced code block ``` lang consumes until matching fence", () => {
    const blocks = tokenize("```ts\nconst x = 1;\nconst y = 2;\n```\n");
    expect(blocks).toHaveLength(1);
    const cb = first(blocks, "codeBlock");
    expect(cb.lang).toBe("ts");
    expect(cb.text).toBe("const x = 1;\nconst y = 2;");
  });

  test("fenced code block ~~~ tilde also works", () => {
    const blocks = tokenize("~~~\nhello\n~~~\n");
    expect(first(blocks, "codeBlock").text).toBe("hello");
  });

  test("unterminated code fence consumes the rest of the source", () => {
    const blocks = tokenize("```\nconst x = 1;\n");
    expect(blocks).toHaveLength(1);
    expect(first(blocks, "codeBlock").text).toBe("const x = 1;");
  });

  test("blockquote line is recognized", () => {
    const blocks = tokenize("> quoted\n> still quoted\n");
    expect(first(blocks, "blockquote").text).toBe("quoted\nstill quoted");
  });

  test("blockquote without leading space also recognized", () => {
    const blocks = tokenize(">q\n");
    expect(first(blocks, "blockquote").text).toBe("q");
  });

  test("unordered list with - marker", () => {
    const blocks = tokenize("- one\n- two\n- three\n");
    const list = first(blocks, "list");
    expect(list.items).toEqual(["one", "two", "three"]);
    expect(list.ordered).toBe(false);
  });

  test("unordered list with * and + markers", () => {
    const a = first(tokenize("* a\n* b\n"), "list");
    const b = first(tokenize("+ a\n+ b\n"), "list");
    expect(a.items).toEqual(["a", "b"]);
    expect(b.items).toEqual(["a", "b"]);
  });

  test("ordered list with 1. 2. markers", () => {
    const blocks = tokenize("1. one\n2. two\n");
    const list = first(blocks, "list");
    expect(list.ordered).toBe(true);
    expect(list.items).toEqual(["one", "two"]);
  });

  test("ordered list allows any leading digit", () => {
    const blocks = tokenize("10. ten\n20. twenty\n");
    const list = first(blocks, "list");
    expect(list.ordered).toBe(true);
    expect(list.items).toEqual(["ten", "twenty"]);
  });

  test("nested list items via 2-space indent", () => {
    const blocks = tokenize("- outer\n  - inner\n  - inner2\n- outer2\n");
    const list = first(blocks, "list");
    expect(list.items).toEqual(["outer", "outer2"]);
    expect(list.children).toEqual([["inner", "inner2"], []]);
  });

  test("pipe table with header and rows", () => {
    const blocks = tokenize("| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n");
    const t = first(blocks, "table");
    expect(t.header).toEqual(["a", "b"]);
    expect(t.rows).toEqual([
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  test("pipe table allows surrounding spaces", () => {
    const t = first(tokenize("| col1 | col2 |\n|----|----|\n| v1 | v2 |\n"), "table");
    expect(t.header).toEqual(["col1", "col2"]);
    expect(t.rows[0]).toEqual(["v1", "v2"]);
  });

  test("table must have a separator line", () => {
    const blocks = tokenize("| a | b |\n| 1 | 2 |\n");
    expect(first(blocks, "paragraph").kind).toBe("paragraph");
  });

  test("table allows alignment markers in separator", () => {
    const blocks = tokenize("| a | b |\n|:--|--:|\n| 1 | 2 |\n");
    expect(first(blocks, "table").kind).toBe("table");
  });

  test("list with code-fence-like content stays as list, not code block", () => {
    const list = first(tokenize("- a\n- ```\n  not a fence\n- b\n"), "list");
    expect(list.items).toEqual(["a", "```\nnot a fence", "b"]);
  });

  test("inline code span is parsed in inline runs", () => {
    const p = first(tokenize("use `foo()` here"), "paragraph");
    expect(p.runs[0]!.text).toBe("use ");
    expect(p.runs[1]!.text).toBe("foo()");
    expect(p.runs[1]!.code).toBe(true);
    expect(p.runs[2]!.text).toBe(" here");
  });

  test("emphasis * and _ produce em runs", () => {
    const p = first(tokenize("this is *em* and _also em_"), "paragraph");
    const ems = p.runs.filter((r) => r.em);
    expect(ems.map((r) => r.text)).toEqual(["em", "also em"]);
  });

  test("strong ** and __ produce strong runs", () => {
    const p = first(tokenize("**strong** and __also__"), "paragraph");
    const strongs = p.runs.filter((r) => r.strong);
    expect(strongs.map((r) => r.text)).toEqual(["strong", "also"]);
  });

  test("strong+em ***text***", () => {
    const p = first(tokenize("***wow***"), "paragraph");
    const r = p.runs[0]!;
    expect(r.text).toBe("wow");
    expect(r.strong).toBe(true);
    expect(r.em).toBe(true);
  });

  test("link [text](href) becomes a link run", () => {
    const p = first(tokenize("see [docs](https://x.com)"), "paragraph");
    const link = p.runs.find((r) => r.href !== undefined);
    expect(link?.text).toBe("docs");
    expect(link?.href).toBe("https://x.com");
  });

  test("link inside a code span is not parsed as a link", () => {
    const p = first(tokenize("`[x](y)`"), "paragraph");
    const code = p.runs[0]!;
    expect(code.code).toBe(true);
    expect(code.href).toBeUndefined();
  });

  test("hard break two-space-newline produces br run", () => {
    const p = first(tokenize("line1  \nline2"), "paragraph");
    const br = p.runs.find((r) => r.br === true);
    expect(br).toBeDefined();
  });
});
