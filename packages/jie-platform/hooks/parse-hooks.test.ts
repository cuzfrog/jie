import { parseHooksConfig } from "./parse-hooks";
import { EMPTY_HOOKS_CONFIG, type HookSource, type HooksConfig } from "./types";

function command(command: string, timeout?: number): Record<string, unknown> {
  return timeout === undefined ? { type: "command", command } : { type: "command", command, timeout };
}

function source(hooks: unknown, path = "/home/.jie/settings.json"): HookSource {
  return { path, hooks };
}

function parseConfig(...sources: HookSource[]): HooksConfig {
  return parseHooksConfig(sources).config;
}

describe("parseHooksConfig — config", () => {
  test("absent hooks on both scopes yields the empty config", () => {
    expect(parseConfig(source(undefined), source(undefined))).toEqual(EMPTY_HOOKS_CONFIG);
  });

  test("non-object hooks values are ignored without throwing", () => {
    expect(parseConfig(source("nope"), source([1, 2]))).toEqual(EMPTY_HOOKS_CONFIG);
    expect(parseConfig(source(null), source(null))).toEqual(EMPTY_HOOKS_CONFIG);
  });

  test("parses a PreToolUse matcher group with command and default timeout", () => {
    const raw = { PreToolUse: [{ matcher: "bash", hooks: [command("./check.sh")] }] };
    const config = parseConfig(source(raw));
    expect(config.PreToolUse).toEqual([{ matcher: "bash", hooks: [{ command: "./check.sh", timeoutMs: 60_000 }] }]);
  });

  test("converts a timeout in seconds to milliseconds", () => {
    const raw = { Stop: [{ hooks: [command("./s.sh", 5)] }] };
    expect(parseConfig(source(raw)).Stop[0]!.hooks[0]!.timeoutMs).toBe(5000);
  });

  test("an invalid timeout falls back to the default", () => {
    const raw = { Stop: [{ hooks: [command("./s.sh", -3)] }] };
    expect(parseConfig(source(raw)).Stop[0]!.hooks[0]!.timeoutMs).toBe(60_000);
  });

  test("matcher of '' or '*' normalizes to null (matches all tools)", () => {
    const raw = { PreToolUse: [{ matcher: "*", hooks: [command("a")] }, { matcher: "  ", hooks: [command("b")] }] };
    const matchers = parseConfig(source(raw)).PreToolUse.map((m) => m.matcher);
    expect(matchers).toEqual([null, null]);
  });

  test("global and project groups merge additively, project after global", () => {
    const global = { PreToolUse: [{ matcher: "bash", hooks: [command("g")] }] };
    const project = { PreToolUse: [{ matcher: "edit", hooks: [command("p")] }] };
    const matchers = parseConfig(source(global), source(project)).PreToolUse;
    expect(matchers.map((m) => m.hooks[0]!.command)).toEqual(["g", "p"]);
    expect(matchers.map((m) => m.matcher)).toEqual(["bash", "edit"]);
  });

  test("non-command handler types are skipped", () => {
    const raw = { PreToolUse: [{ hooks: [{ type: "http", url: "x" }, command("ok")] }] };
    const group = parseConfig(source(raw)).PreToolUse[0]!;
    expect(group.hooks.map((h) => h.command)).toEqual(["ok"]);
  });

  test("a group whose commands are all invalid is dropped", () => {
    const raw = { PreToolUse: [{ hooks: [{ type: "command", command: "" }, { type: "prompt" }] }] };
    expect(parseConfig(source(raw)).PreToolUse).toEqual([]);
  });

  test("unknown event keys are ignored", () => {
    const raw = { NotAnEvent: [{ hooks: [command("x")] }] };
    expect(parseConfig(source(raw))).toEqual(EMPTY_HOOKS_CONFIG);
  });

  test("malformed groups and non-array event values are skipped without throwing", () => {
    const raw = { PreToolUse: "not-an-array", PostToolUse: [null, 42, { matcher: "bash" }, { hooks: [command("keep")] }] };
    const config = parseConfig(source(raw));
    expect(config.PreToolUse).toEqual([]);
    expect(config.PostToolUse.map((m) => m.hooks[0]!.command)).toEqual(["keep"]);
  });
});

describe("parseHooksConfig — diagnostics", () => {
  test("absent hooks and a fully valid config yield no diagnostics", () => {
    const raw = { PreToolUse: [{ matcher: "bash", hooks: [command("ok")] }] };
    expect(parseHooksConfig([source(undefined)]).diagnostics).toEqual([]);
    expect(parseHooksConfig([source(raw)]).diagnostics).toEqual([]);
  });

  test("a non-object hooks value reports the offending file", () => {
    const result = parseHooksConfig([source("nope", "/g/settings.json")]);
    expect(result.diagnostics).toEqual([{ path: "/g/settings.json", message: "'hooks' must be an object; ignoring" }]);
  });

  test("a non-array event value is reported", () => {
    const result = parseHooksConfig([source({ PreToolUse: "not-an-array" })]);
    expect(result.diagnostics.map((d) => d.message)).toEqual(["'PreToolUse' must be an array of matcher groups; ignoring"]);
  });

  test("a non-object matcher group is reported", () => {
    const result = parseHooksConfig([source({ PreToolUse: [42] })]);
    expect(result.diagnostics.map((d) => d.message)).toEqual(["'PreToolUse' matcher group must be an object; skipping"]);
  });

  test("a group with a non-array 'hooks' field is reported", () => {
    const result = parseHooksConfig([source({ PreToolUse: [{ matcher: "bash" }] })]);
    expect(result.diagnostics.map((d) => d.message)).toEqual(["'PreToolUse' matcher group 'hooks' must be an array; skipping"]);
  });

  test("a non-command handler type is reported", () => {
    const result = parseHooksConfig([source({ PreToolUse: [{ hooks: [{ type: "http", url: "x" }] }] })]);
    const messages = result.diagnostics.map((d) => d.message);
    expect(messages).toContain("'PreToolUse' hook handler 'type' must be \"command\"; skipping");
    expect(messages).toContain("'PreToolUse' matcher group has no valid command handlers; skipping");
  });

  test("an empty command is reported", () => {
    const result = parseHooksConfig([source({ PostToolUse: [{ hooks: [{ type: "command", command: "" }] }] })]);
    const messages = result.diagnostics.map((d) => d.message);
    expect(messages).toContain("'PostToolUse' hook handler 'command' must be a non-empty string; skipping");
  });

  test("a non-string matcher is reported and treated as match-all", () => {
    const result = parseHooksConfig([source({ PreToolUse: [{ matcher: 5, hooks: [command("ok")] }] })]);
    expect(result.diagnostics.map((d) => d.message)).toEqual(["'PreToolUse' 'matcher' must be a string; treating as match-all"]);
    expect(result.config.PreToolUse[0]!.matcher).toBeNull();
  });

  test("an invalid regex matcher is reported and treated as match-all", () => {
    const result = parseHooksConfig([source({ PreToolUse: [{ matcher: "[", hooks: [command("ok")] }] })]);
    expect(result.diagnostics.map((d) => d.message))
      .toEqual(["'PreToolUse' 'matcher' is not a valid regular expression; treating as match-all"]);
    expect(result.config.PreToolUse[0]!.matcher).toBeNull();
    expect(result.config.PreToolUse[0]!.hooks).toHaveLength(1);
  });

  test("a matcher on a non-tool event is reported and treated as match-all", () => {
    const result = parseHooksConfig([source({ UserPromptSubmit: [{ matcher: "bash", hooks: [command("ok")] }] })]);
    expect(result.diagnostics.map((d) => d.message))
      .toEqual(["'UserPromptSubmit' is not a tool event; its 'matcher' is ignored; treating as match-all"]);
    expect(result.config.UserPromptSubmit[0]!.matcher).toBeNull();
    expect(result.config.UserPromptSubmit[0]!.hooks).toHaveLength(1);
  });

  test("diagnostics carry the path of the scope they came from", () => {
    const global = { PreToolUse: [{ hooks: [{ type: "nope" }] }] };
    const project = { Stop: "bad" };
    const result = parseHooksConfig([source(global, "/home/settings.json"), source(project, "/proj/settings.json")]);
    const byPath = result.diagnostics.map((d) => d.path);
    expect(byPath).toContain("/home/settings.json");
    expect(byPath).toContain("/proj/settings.json");
  });
});
