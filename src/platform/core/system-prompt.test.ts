import type { Skill } from "../skills";
import { composeSystemPrompt } from "./system-prompt";

function skill(name: string, entry: string): Skill {
  return {
    name, description: `${name} description`, argumentHint: null, filePath: `/${name}/SKILL.md`, baseDir: `/${name}`, body: "body",
    expandInvocation: () => "",
    promptEntry: () => entry,
  };
}

function tool(name: string, description: string): { readonly name: string; readonly description: string } {
  return { name, description };
}

const CWD = "/work";
const CWD_LINE = `Current working directory: ${CWD}`;
const BASH_GUIDE = "- Use bash for file operations like ls, rg, find";

function available(tools: string): string {
  return `Available tools:\n${tools}`;
}

function guidelines(...bullets: string[]): string {
  return `Guidelines:\n${bullets.map((b) => `- ${b}`).join("\n")}`;
}

const DEFAULT_GUIDELINES = guidelines("Be concise in your responses", "Show file paths clearly when working with files");

describe("composeSystemPrompt", () => {
  test("role prompt is first and is followed by Available tools, Guidelines, and cwd", () => {
    const output = composeSystemPrompt({ rolePrompt: "You are a worker.", cwd: CWD });
    expect(output).toBe(`You are a worker.\n\n${available("(none)")}\n\n${DEFAULT_GUIDELINES}\n\n${CWD_LINE}`);
  });

  test("renders each tool as a name and a one-line snippet", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("bash", "Run a shell command. Output is truncated."), tool("read_file", "Read a file. More detail.")],
    });
    expect(output).toContain("Available tools:\n- bash: Run a shell command.\n- read_file: Read a file.");
  });

  test("snippets stop at the first newline if there is no sentence break", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("bash", "Run a shell command\nMore text on the next line.")],
    });
    expect(output).toContain("- bash: Run a shell command");
    expect(output).not.toContain("More text");
  });

  test("uses the whole description when there is no sentence break or newline", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("noop", "Do nothing at all")],
    });
    expect(output).toContain("- noop: Do nothing at all");
  });

  test("adds the bash file-ops guideline only when bash is the sole file-exploration tool", () => {
    const onlyBash = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("bash", "Run a shell command.")],
    });
    expect(onlyBash).toContain(BASH_GUIDE);

    const withLs = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("bash", "Run a shell command."), tool("ls", "List files.")],
    });
    expect(withLs).not.toContain(BASH_GUIDE);

    const withGrep = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("bash", "Run a shell command."), tool("grep_file", "Search files.")],
    });
    expect(withGrep).not.toContain(BASH_GUIDE);

    const withFind = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      tools: [tool("bash", "Run a shell command."), tool("find_file", "Find files.")],
    });
    expect(withFind).not.toContain(BASH_GUIDE);
  });

  test("places the context block after the guidelines", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      contextBlock: "<context_files>X</context_files>",
    });
    const guideIndex = output.indexOf("Guidelines:");
    const contextIndex = output.indexOf("<context_files>");
    expect(guideIndex).toBeLessThan(contextIndex);
  });

  test("places the skills block after the context block", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      contextBlock: "<context_files>X</context_files>",
      skills: [skill("deploy", "ENTRY-deploy")],
    });
    expect(output.indexOf("<context_files>")).toBeLessThan(output.indexOf("<available_skills>"));
    expect(output.indexOf("<available_skills>")).toBeLessThan(output.indexOf("</available_skills>"));
  });

  test("places the memory block after the skills block", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      skills: [skill("deploy", "ENTRY")],
      memoryBlock: "<memory team=\"t1\">- [instruction] keep the build green</memory>",
    });
    expect(output.indexOf("</available_skills>")).toBeLessThan(output.indexOf("<memory"));
  });

  test("places the cwd line after every other section", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      contextBlock: "<context_files>X</context_files>",
      skills: [skill("deploy", "ENTRY")],
      memoryBlock: "<memory>x</memory>",
    });
    expect(output.endsWith(CWD_LINE)).toBe(true);
  });

  test("an empty context block is omitted", () => {
    const output = composeSystemPrompt({ rolePrompt: "ROLE", cwd: CWD, contextBlock: "" });
    expect(output).not.toContain("<context_files>");
    expect(output.endsWith(CWD_LINE)).toBe(true);
  });

  test("an empty memory block is omitted", () => {
    const output = composeSystemPrompt({ rolePrompt: "ROLE", cwd: CWD, memoryBlock: "" });
    expect(output).not.toContain("<memory");
  });

  test("normalizes Windows path separators in cwd", () => {
    const output = composeSystemPrompt({ rolePrompt: "ROLE", cwd: "C:\\project" });
    expect(output).toContain("Current working directory: C:/project");
  });

  test("dedupes skills by name, first occurrence wins", () => {
    const output = composeSystemPrompt({
      rolePrompt: "ROLE",
      cwd: CWD,
      skills: [skill("deploy", "ENTRY-first"), skill("deploy", "ENTRY-second")],
    });
    expect(output.match(/ENTRY-first/g)).toHaveLength(1);
    expect(output).not.toContain("ENTRY-second");
  });
});
