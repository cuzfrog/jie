import type {
  CommandExecutor,
  HookCommand,
  HookEvent,
  HookIdentity,
  HookMatcher,
  HooksConfig,
  HookRunner,
  PostToolUseInput,
  PostToolUseOutcome,
  PreToolUseInput,
  PreToolUseOutcome,
  SessionStartInput,
  StopInput,
  UserPromptSubmitInput,
  UserPromptSubmitOutcome,
} from "./types";

interface HookOutput {
  readonly shouldBlock: boolean;
  readonly reason: string | null;
  readonly additionalContext: string | null;
}

const NO_OUTPUT: HookOutput = { shouldBlock: false, reason: null, additionalContext: null };

export class HookRunnerImpl implements HookRunner {
  constructor(
    private readonly config: HooksConfig,
    private readonly executor: CommandExecutor,
  ) {}

  async preToolUse(input: PreToolUseInput): Promise<PreToolUseOutcome> {
    for (const command of selectCommands(this.config.PreToolUse, input.toolName)) {
      const output = await this.run(command, "PreToolUse", input.identity, {
        tool_name: input.toolName,
        tool_input: input.toolInput,
      });
      if (output.shouldBlock) return { block: true, reason: output.reason };
    }
    return { block: false, reason: null };
  }

  async postToolUse(input: PostToolUseInput): Promise<PostToolUseOutcome> {
    let additionalContext: string | null = null;
    for (const command of selectCommands(this.config.PostToolUse, input.toolName)) {
      const output = await this.run(command, "PostToolUse", input.identity, {
        tool_name: input.toolName,
        tool_input: input.toolInput,
        tool_response: input.toolResponse,
      });
      if (output.shouldBlock) return { block: true, reason: output.reason, additionalContext };
      if (output.additionalContext !== null) additionalContext = output.additionalContext;
    }
    return { block: false, reason: null, additionalContext };
  }

  async userPromptSubmit(input: UserPromptSubmitInput): Promise<UserPromptSubmitOutcome> {
    let additionalContext: string | null = null;
    for (const command of selectCommands(this.config.UserPromptSubmit, null)) {
      const output = await this.run(command, "UserPromptSubmit", input.identity, { prompt: input.prompt });
      if (output.shouldBlock) return { block: true, reason: output.reason, additionalContext };
      if (output.additionalContext !== null) additionalContext = output.additionalContext;
    }
    return { block: false, reason: null, additionalContext };
  }

  async sessionStart(input: SessionStartInput): Promise<void> {
    for (const command of selectCommands(this.config.SessionStart, null)) {
      await this.run(command, "SessionStart", input.identity, {});
    }
  }

  async stop(input: StopInput): Promise<void> {
    for (const command of selectCommands(this.config.Stop, null)) {
      await this.run(command, "Stop", input.identity, {});
    }
  }

  private async run(
    command: HookCommand,
    event: HookEvent,
    identity: HookIdentity,
    fields: Record<string, unknown>,
  ): Promise<HookOutput> {
    const stdin = JSON.stringify({
      session_id: identity.sessionId,
      hook_event_name: event,
      cwd: identity.cwd,
      team_id: identity.teamId,
      agent_key: identity.agentKey,
      role: identity.role,
      ...fields,
    });
    const result = await this.executor.execute({
      command: command.command,
      timeoutMs: command.timeoutMs,
      stdin,
      cwd: identity.cwd,
    });
    if (result.timedOut) return NO_OUTPUT;
    return interpret(result.exitCode, result.stdout, result.stderr);
  }
}

function selectCommands(matchers: ReadonlyArray<HookMatcher>, toolName: string | null): HookCommand[] {
  const out: HookCommand[] = [];
  for (const matcher of matchers) {
    if (!matchesTool(matcher.matcher, toolName)) continue;
    out.push(...matcher.hooks);
  }
  return out;
}

function matchesTool(matcher: string | null, toolName: string | null): boolean {
  if (matcher === null) return true;
  if (toolName === null) return false;
  try {
    return new RegExp(matcher).test(toolName);
  } catch {
    return false;
  }
}

function interpret(exitCode: number, stdout: string, stderr: string): HookOutput {
  const parsed = tryParseJson(stdout);
  const blockedByJson = parsed?.continue === false || parsed?.decision === "block";
  const blockedByExit = exitCode === 2;
  const shouldBlock = blockedByJson || blockedByExit;
  const reason = typeof parsed?.reason === "string"
    ? parsed.reason
    : blockedByExit && stderr.trim() !== ""
      ? stderr.trim()
      : null;
  const hookSpecific = parsed?.hookSpecificOutput;
  const context = isObject(hookSpecific) ? hookSpecific.additionalContext : null;
  const additionalContext = typeof context === "string" ? context : null;
  return { shouldBlock, reason, additionalContext };
}

function tryParseJson(stdout: string): Record<string, unknown> | null {
  const trimmed = stdout.trim();
  if (trimmed === "") return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
