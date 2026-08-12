import { makeTuiState } from "../test";
import { PositionalSlashCommand } from "./positional-slash-command";
import { type ResolvedCommand, type SlashCompletion, type SlashContext } from "./slash-command";

class TestCommand extends PositionalSlashCommand {
  readonly captured: Record<string, string | undefined> = {};

  constructor(meta: { readonly name: string; readonly description: string; readonly argumentHint?: string; readonly arguments?: ReadonlyArray<{ readonly name: string; readonly optional?: boolean; readonly greedy?: boolean }> }) {
    super(meta as unknown as import("./slash-command").CommandMeta);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    Object.assign(this.captured, parsed);
    return { kind: "ui", action: "showHelp" };
  }

  protected override completeArgument(argumentText: string, _context: SlashContext): SlashCompletion | null {
    return argumentText === "" ? { items: [{ value: "x", label: "x" }] } : null;
  }
}

function contextFor(state = makeTuiState()): SlashContext {
  return { state, platform: {} as SlashContext["platform"] };
}

describe("PositionalSlashCommand", () => {
  test("no-arguments command accepts empty args and rejects extra args", () => {
    const command = new TestCommand({ name: "exit", description: "exit" });
    expect(command.resolve(contextFor(), [])).toEqual({ kind: "ui", action: "showHelp" });
    expect((command.resolve(contextFor(), ["extra"]) as ResolvedCommand & { kind: "error" }).text).toContain("/exit");
  });

  test("one-argument command parses the first token", () => {
    const command = new TestCommand({ name: "team", description: "team", argumentHint: "<id>", arguments: [{ name: "id" }] });
    command.resolve(contextFor(), ["my-team"]);
    expect(command.captured.id).toBe("my-team");
  });

  test("a greedy argument joins the remaining tokens", () => {
    const command = new TestCommand({ name: "rename", description: "rename", argumentHint: "<name>", arguments: [{ name: "name", greedy: true }] });
    command.resolve(contextFor(), ["my", "session", "name"]);
    expect(command.captured.name).toBe("my session name");
  });

  test("an optional argument is undefined when omitted", () => {
    const command = new TestCommand({ name: "effort", description: "effort", argumentHint: "<level>", arguments: [{ name: "level", optional: true }] });
    command.resolve(contextFor(), []);
    expect(command.captured.level).toBeUndefined();
    command.resolve(contextFor(), ["high"]);
    expect(command.captured.level).toBe("high");
  });

  test("multi-argument command parses each positional token", () => {
    const command = new TestCommand({ name: "login", description: "login", argumentHint: "<provider> <key>", arguments: [{ name: "provider" }, { name: "key" }] });
    command.resolve(contextFor(), ["anthropic", "sk-test"]);
    expect(command.captured.provider).toBe("anthropic");
    expect(command.captured.key).toBe("sk-test");
  });

  test("usage error includes the argument hint", () => {
    const command = new TestCommand({ name: "team", description: "team", argumentHint: "<id>", arguments: [{ name: "id" }] });
    const result = command.resolve(contextFor(), []) as ResolvedCommand & { kind: "error" };
    expect(result.text).toBe("/team <id>");
  });

  test("complete delegates to completeArgument for a single argument and returns null for multiple", () => {
    const one = new TestCommand({ name: "one", description: "one", arguments: [{ name: "id" }] });
    expect(one.complete("", contextFor())).toEqual({ items: [{ value: "x", label: "x" }] });

    const multi = new TestCommand({ name: "two", description: "two", arguments: [{ name: "a" }, { name: "b" }] });
    expect(multi.complete("a", contextFor())).toBeNull();
  });
});
