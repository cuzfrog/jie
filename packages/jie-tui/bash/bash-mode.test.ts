import { parseBashCommand, bashDirective } from "./bash-mode";

describe("parseBashCommand", () => {
  test("returns null for empty input", () => {
    expect(parseBashCommand("")).toBeNull();
  });

  test("returns null for plain text without ! prefix", () => {
    expect(parseBashCommand("hello world")).toBeNull();
  });

  test("returns null for slash commands (those are routed separately)", () => {
    expect(parseBashCommand("/help")).toBeNull();
  });

  test("returns null when only the bang is typed", () => {
    expect(parseBashCommand("!")).toBeNull();
    expect(parseBashCommand("! ")).toBeNull();
  });

  test("returns null when only the double bang is typed", () => {
    expect(parseBashCommand("!!")).toBeNull();
    expect(parseBashCommand("!! ")).toBeNull();
  });

  test("parses a single-bang command", () => {
    expect(parseBashCommand("!ls")).toEqual({ mode: "with", command: "ls" });
    expect(parseBashCommand("!ls -la /tmp")).toEqual({ mode: "with", command: "ls -la /tmp" });
  });

  test("parses a double-bang command as the exclude-from-context variant", () => {
    expect(parseBashCommand("!!cat secret.txt")).toEqual({ mode: "exclude", command: "cat secret.txt" });
  });

  test("preserves the command verbatim, including interior whitespace", () => {
    expect(parseBashCommand("!echo   hello   world")).toEqual({ mode: "with", command: "echo   hello   world" });
  });

  test("tolerates leading whitespace before the bang", () => {
    expect(parseBashCommand("  !pwd")).toEqual({ mode: "with", command: "pwd" });
  });
});

describe("bashDirective", () => {
  test("produces a directive that quotes the command for the with-context mode", () => {
    const text = bashDirective({ mode: "with", command: "ls -la" });
    expect(text).toContain("ls -la");
    expect(text).toContain("bash tool");
  });

  test("produces a directive that asks the agent to exclude context for the exclude mode", () => {
    const text = bashDirective({ mode: "exclude", command: "cat secret" });
    expect(text).toContain("cat secret");
    expect(text.toLowerCase()).toContain("not include");
  });
});
