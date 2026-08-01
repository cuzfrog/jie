import { parseHooksConfig } from "./parse-hooks";
import { EMPTY_HOOKS_CONFIG } from "./types";

function command(command: string, timeout?: number): Record<string, unknown> {
  return timeout === undefined ? { type: "command", command } : { type: "command", command, timeout };
}

describe("parseHooksConfig", () => {
  test("absent hooks on both scopes yields the empty config", () => {
    expect(parseHooksConfig(undefined, undefined)).toEqual(EMPTY_HOOKS_CONFIG);
  });

  test("non-object hooks values are ignored without throwing", () => {
    expect(parseHooksConfig("nope", [1, 2])).toEqual(EMPTY_HOOKS_CONFIG);
    expect(parseHooksConfig(null, null)).toEqual(EMPTY_HOOKS_CONFIG);
  });

  test("parses a PreToolUse matcher group with command and default timeout", () => {
    const raw = { PreToolUse: [{ matcher: "bash", hooks: [command("./check.sh")] }] };
    const config = parseHooksConfig(raw, undefined);
    expect(config.PreToolUse).toEqual([{ matcher: "bash", hooks: [{ command: "./check.sh", timeoutMs: 60_000 }] }]);
  });

  test("converts a timeout in seconds to milliseconds", () => {
    const raw = { Stop: [{ hooks: [command("./s.sh", 5)] }] };
    expect(parseHooksConfig(raw, undefined).Stop[0]!.hooks[0]!.timeoutMs).toBe(5000);
  });

  test("an invalid timeout falls back to the default", () => {
    const raw = { Stop: [{ hooks: [command("./s.sh", -3)] }] };
    expect(parseHooksConfig(raw, undefined).Stop[0]!.hooks[0]!.timeoutMs).toBe(60_000);
  });

  test("matcher of '' or '*' normalizes to null (matches all tools)", () => {
    const raw = { PreToolUse: [{ matcher: "*", hooks: [command("a")] }, { matcher: "  ", hooks: [command("b")] }] };
    const matchers = parseHooksConfig(raw, undefined).PreToolUse.map((m) => m.matcher);
    expect(matchers).toEqual([null, null]);
  });

  test("global and project groups merge additively, project after global", () => {
    const global = { PreToolUse: [{ matcher: "bash", hooks: [command("g")] }] };
    const project = { PreToolUse: [{ matcher: "edit", hooks: [command("p")] }] };
    const matchers = parseHooksConfig(global, project).PreToolUse;
    expect(matchers.map((m) => m.hooks[0]!.command)).toEqual(["g", "p"]);
    expect(matchers.map((m) => m.matcher)).toEqual(["bash", "edit"]);
  });

  test("non-command handler types are skipped", () => {
    const raw = { PreToolUse: [{ hooks: [{ type: "http", url: "x" }, command("ok")] }] };
    const group = parseHooksConfig(raw, undefined).PreToolUse[0]!;
    expect(group.hooks.map((h) => h.command)).toEqual(["ok"]);
  });

  test("a group whose commands are all invalid is dropped", () => {
    const raw = { PreToolUse: [{ hooks: [{ type: "command", command: "" }, { type: "prompt" }] }] };
    expect(parseHooksConfig(raw, undefined).PreToolUse).toEqual([]);
  });

  test("unknown event keys are ignored", () => {
    const raw = { NotAnEvent: [{ hooks: [command("x")] }] };
    expect(parseHooksConfig(raw, undefined)).toEqual(EMPTY_HOOKS_CONFIG);
  });

  test("malformed groups and non-array event values are skipped without throwing", () => {
    const raw = { PreToolUse: "not-an-array", PostToolUse: [null, 42, { matcher: "bash" }, { hooks: [command("keep")] }] };
    const config = parseHooksConfig(raw, undefined);
    expect(config.PreToolUse).toEqual([]);
    expect(config.PostToolUse.map((m) => m.hooks[0]!.command)).toEqual(["keep"]);
  });
});
