import { measureMarkdown } from "./measure";

describe("measureMarkdown", () => {
  test("empty source measures zero rows", () => {
    expect(measureMarkdown("", 80)).toBe(0);
  });

  test("adjacent lines merge into one paragraph row like the renderer", () => {
    expect(measureMarkdown("line1\nline2", 80)).toBe(1);
  });

  test("blank line separates paragraphs", () => {
    expect(measureMarkdown("a\n\nb", 80)).toBe(2);
  });

  test("long paragraph wraps across rows", () => {
    expect(measureMarkdown("a".repeat(25), 10)).toBe(3);
  });

  test("hard break (two trailing spaces) forces a new row", () => {
    expect(measureMarkdown("a  \nb", 80)).toBe(2);
  });

  test("first-line prefix columns wrap the first row", () => {
    expect(measureMarkdown("a".repeat(8), 10, "xxxx")).toBe(2);
  });

  test("prefix applies only to the first block", () => {
    expect(measureMarkdown("# t\n\np", 10, "xxxxxxxx")).toBe(3);
  });

  test("heading prefix repeats the hash per level", () => {
    expect(measureMarkdown("## " + "a".repeat(7), 10)).toBe(1);
    expect(measureMarkdown("### " + "a".repeat(7), 10)).toBe(2);
  });

  test("code block counts content lines", () => {
    expect(measureMarkdown("```\na\nb\nc\n```", 80)).toBe(3);
  });

  test("code block with lang counts the lang line", () => {
    expect(measureMarkdown("```ts\na\n```", 80)).toBe(2);
  });

  test("code lines wrap inside the padded box", () => {
    expect(measureMarkdown("```\n" + "a".repeat(15) + "\n```", 12)).toBe(2);
  });

  test("list counts one row per item", () => {
    expect(measureMarkdown("- a\n- b\n- c", 80)).toBe(3);
  });

  test("ordered list bullet width wraps long items", () => {
    expect(measureMarkdown(`1. ${"a".repeat(9)}`, 10)).toBe(2);
  });

  test("nested list children indent and count their own rows", () => {
    expect(measureMarkdown("- a\n  - b", 80)).toBe(2);
  });

  test("blockquote keeps a row per source line", () => {
    expect(measureMarkdown("> a\n> b", 80)).toBe(2);
  });

  test("horizontal rule is one row", () => {
    expect(measureMarkdown("---", 80)).toBe(1);
  });

  test("narrow horizontal rule wraps", () => {
    expect(measureMarkdown("---", 10)).toBe(4);
  });

  test("table counts header, separator and body rows", () => {
    expect(measureMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |", 80)).toBe(4);
  });
});
