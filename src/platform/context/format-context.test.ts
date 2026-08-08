import { formatContextFilesForPrompt } from "./format-context";
import type { ContextFile } from "./types";

function file(path: string, content: string): ContextFile {
  return { path, content };
}

describe("formatContextFilesForPrompt", () => {
  test("an empty list yields the empty string", () => {
    expect(formatContextFilesForPrompt([])).toBe("");
  });

  test("wraps each file in a context_file element inside a context_files block", () => {
    const output = formatContextFilesForPrompt([file("/proj/AGENTS.md", "be concise")]);
    expect(output).toContain("<context_files>");
    expect(output).toContain('<context_file path="/proj/AGENTS.md">');
    expect(output).toContain("be concise");
    expect(output).toContain("</context_file>");
    expect(output).toContain("</context_files>");
  });

  test("file content is injected verbatim, not XML-escaped", () => {
    const output = formatContextFilesForPrompt([file("/proj/AGENTS.md", "use <b>bold</b> & code")]);
    expect(output).toContain("use <b>bold</b> & code");
  });

  test("the path attribute is XML-escaped", () => {
    const output = formatContextFilesForPrompt([file('/a "quoted" & <dir>/AGENTS.md', "x")]);
    expect(output).toContain('path="/a &quot;quoted&quot; &amp; &lt;dir&gt;/AGENTS.md"');
  });

  test("trailing whitespace in content is trimmed", () => {
    const output = formatContextFilesForPrompt([file("/proj/AGENTS.md", "line\n\n\n")]);
    expect(output).toContain("line\n  </context_file>");
  });

  test("multiple files each get their own element in order", () => {
    const output = formatContextFilesForPrompt([
      file("/a/AGENTS.md", "first"),
      file("/b/CLAUDE.md", "second"),
    ]);
    expect(output.indexOf("first")).toBeLessThan(output.indexOf("second"));
    expect(output.match(/<context_file /g)).toHaveLength(2);
  });
});
