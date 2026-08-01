import { HookRunnerImpl } from "./hook-runner";
import type {
  CommandExecutor,
  HookCommand,
  HookCommandResult,
  HookIdentity,
  HooksConfig,
} from "./types";
import { EMPTY_HOOKS_CONFIG } from "./types";

function identity(): HookIdentity {
  return { sessionId: "s1", cwd: "/work", teamId: "t1", agentKey: "general-1", role: "general" };
}

function cmd(command: string): HookCommand {
  return { command, timeoutMs: 1000 };
}

function config(overrides: Partial<HooksConfig>): HooksConfig {
  return { ...EMPTY_HOOKS_CONFIG, ...overrides };
}

function result(overrides: Partial<HookCommandResult> = {}): HookCommandResult {
  return { exitCode: 0, stdout: "", stderr: "", timedOut: false, ...overrides };
}

function makeRunner(cfg: HooksConfig): { runner: HookRunnerImpl; executor: ReturnType<typeof vi.mocked<CommandExecutor>> } {
  const executor = vi.mocked<CommandExecutor>({ execute: vi.fn(async () => result()) });
  return { runner: new HookRunnerImpl(cfg, executor), executor };
}

describe("HookRunner — preToolUse", () => {
  test("a matcher that does not match the tool runs nothing and does not block", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: "bash", hooks: [cmd("x")] }] }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "edit", toolInput: {} });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(outcome).toEqual({ block: false, reason: null });
  });

  test("a matching regex runs the command with a snake_case stdin payload", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: "ba.*", hooks: [cmd("./check.sh")] }] }));
    await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: { command: "ls" } });
    expect(executor.execute).toHaveBeenCalledTimes(1);
    const request = executor.execute.mock.calls[0]![0]!;
    expect(request.command).toBe("./check.sh");
    expect(request.timeoutMs).toBe(1000);
    expect(request.cwd).toBe("/work");
    expect(JSON.parse(request.stdin)).toEqual({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      cwd: "/work",
      team_id: "t1",
      agent_key: "general-1",
      role: "general",
      tool_name: "bash",
      tool_input: { command: "ls" },
    });
  });

  test("exit code 2 blocks with the stderr text as the reason", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ exitCode: 2, stderr: "denied\n" }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(outcome).toEqual({ block: true, reason: "denied" });
  });

  test("a JSON decision of block carries the reason", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ stdout: JSON.stringify({ decision: "block", reason: "policy" }) }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(outcome).toEqual({ block: true, reason: "policy" });
  });

  test("continue:false blocks", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ stdout: JSON.stringify({ continue: false }) }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(outcome.block).toBe(true);
  });

  test("a clean exit does not block", async () => {
    const { runner } = makeRunner(config({ PreToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(outcome).toEqual({ block: false, reason: null });
  });

  test("the first blocking command short-circuits the rest", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: null, hooks: [cmd("a"), cmd("b")] }] }));
    executor.execute.mockResolvedValue(result({ exitCode: 2, stderr: "stop" }));
    await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(executor.execute).toHaveBeenCalledTimes(1);
  });

  test("a timeout is non-blocking even with exit code 2", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ timedOut: true, exitCode: 2 }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(outcome.block).toBe(false);
  });

  test("an invalid regex matcher is treated as no match", async () => {
    const { runner, executor } = makeRunner(config({ PreToolUse: [{ matcher: "[", hooks: [cmd("x")] }] }));
    const outcome = await runner.preToolUse({ identity: identity(), toolName: "bash", toolInput: {} });
    expect(executor.execute).not.toHaveBeenCalled();
    expect(outcome.block).toBe(false);
  });
});

describe("HookRunner — postToolUse", () => {
  test("collects additionalContext from hookSpecificOutput", async () => {
    const { runner, executor } = makeRunner(config({ PostToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: "ctx" } }) }));
    const outcome = await runner.postToolUse({ identity: identity(), toolName: "bash", toolInput: {}, toolResponse: "ok" });
    expect(outcome).toEqual({ block: false, reason: null, additionalContext: "ctx" });
  });

  test("a blocking hook returns an error outcome", async () => {
    const { runner, executor } = makeRunner(config({ PostToolUse: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ exitCode: 2, stderr: "bad output" }));
    const outcome = await runner.postToolUse({ identity: identity(), toolName: "bash", toolInput: {}, toolResponse: "ok" });
    expect(outcome.block).toBe(true);
    expect(outcome.reason).toBe("bad output");
  });
});

describe("HookRunner — userPromptSubmit / lifecycle", () => {
  test("only matcher-less groups run for a non-tool event", async () => {
    const { runner, executor } = makeRunner(config({
      UserPromptSubmit: [{ matcher: null, hooks: [cmd("runs")] }, { matcher: "bash", hooks: [cmd("skipped")] }],
    }));
    await runner.userPromptSubmit({ identity: identity(), prompt: "hello" });
    expect(executor.execute).toHaveBeenCalledTimes(1);
    const request = executor.execute.mock.calls[0]![0]!;
    expect(request.command).toBe("runs");
    expect(JSON.parse(request.stdin)).toMatchObject({ hook_event_name: "UserPromptSubmit", prompt: "hello" });
  });

  test("a blocking UserPromptSubmit hook reports the reason", async () => {
    const { runner, executor } = makeRunner(config({ UserPromptSubmit: [{ matcher: null, hooks: [cmd("x")] }] }));
    executor.execute.mockResolvedValue(result({ stdout: JSON.stringify({ decision: "block", reason: "no" }) }));
    const outcome = await runner.userPromptSubmit({ identity: identity(), prompt: "hello" });
    expect(outcome).toEqual({ block: true, reason: "no", additionalContext: null });
  });

  test("sessionStart and stop run their commands and resolve", async () => {
    const { runner, executor } = makeRunner(config({
      SessionStart: [{ matcher: null, hooks: [cmd("start")] }],
      Stop: [{ matcher: null, hooks: [cmd("stop")] }],
    }));
    await runner.sessionStart({ identity: identity() });
    await runner.stop({ identity: identity() });
    expect(executor.execute).toHaveBeenCalledTimes(2);
  });
});
