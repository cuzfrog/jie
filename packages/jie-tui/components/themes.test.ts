import { Themes } from "./themes";

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

const selectListTheme = Themes.editorTheme.selectList;
const markdownTheme = Themes.markdownTheme;
const editorTheme = Themes.editorTheme;

describe("themes — hex tokens match pi spec", () => {
  test("selectListTheme selectedPrefix uses accent #8abeb7", () => {
    const out = selectListTheme.selectedPrefix(">");
    expect(out).toContain("\x1b[");
    expect(out).toContain("38;2;138;190;183");
    expect(stripAnsi(out)).toBe(">");
  });

  test("selectListTheme selectedText uses accent + bold", () => {
    const out = selectListTheme.selectedText("item");
    expect(out).toContain("38;2;138;190;183");
    expect(out).toContain("1");
    expect(stripAnsi(out)).toBe("item");
  });

  test("selectListTheme description/scrollInfo/noMatch use muted #808080", () => {
    expect(selectListTheme.description("d")).toContain("38;2;128;128;128");
    expect(selectListTheme.scrollInfo("s")).toContain("38;2;128;128;128");
    expect(selectListTheme.noMatch("n")).toContain("38;2;128;128;128");
  });

  test("markdownTheme heading uses mdHeading #f0c674 + bold", () => {
    const out = markdownTheme.heading("h");
    expect(out).toContain("38;2;240;198;116");
    expect(out).toContain("1");
  });

  test("markdownTheme link uses mdLink #81a2be + underline", () => {
    const out = markdownTheme.link("a");
    expect(out).toContain("38;2;129;162;190");
    expect(out).toContain("4");
  });

  test("markdownTheme code uses mdCode #8abeb7", () => {
    expect(markdownTheme.code("c")).toContain("38;2;138;190;183");
  });

  test("markdownTheme codeBlock uses mdCodeBlock #b5bd68", () => {
    expect(markdownTheme.codeBlock("c")).toContain("38;2;181;189;104");
  });

  test("markdownTheme quote uses mdQuote #808080 + italic", () => {
    const out = markdownTheme.quote("q");
    expect(out).toContain("38;2;128;128;128");
    expect(out).toContain("3");
  });

  test("markdownTheme listBullet uses mdListBullet #8abeb7", () => {
    expect(markdownTheme.listBullet("-")).toContain("38;2;138;190;183");
  });

  test("editorTheme borderColor uses borderMuted #505050", () => {
    expect(editorTheme.borderColor("─")).toContain("38;2;80;80;80");
  });
});
