export const HOOK_EVENTS = ["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "Stop"] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookCommand {
  readonly command: string;
  readonly timeoutMs: number;
}

export interface HookMatcher {
  readonly matcher: string | null;
  readonly hooks: ReadonlyArray<HookCommand>;
}

export type HooksConfig = Readonly<Record<HookEvent, ReadonlyArray<HookMatcher>>>;

export const EMPTY_HOOKS_CONFIG: HooksConfig = {
  PreToolUse: [],
  PostToolUse: [],
  UserPromptSubmit: [],
  SessionStart: [],
  Stop: [],
};

export const DEFAULT_HOOK_TIMEOUT_MS = 60_000;

export interface HookIdentity {
  readonly sessionId: string;
  readonly cwd: string;
  readonly teamId: string;
  readonly agentKey: string;
  readonly role: string;
}

export interface PreToolUseInput {
  readonly identity: HookIdentity;
  readonly toolName: string;
  readonly toolInput: unknown;
}

export interface PostToolUseInput {
  readonly identity: HookIdentity;
  readonly toolName: string;
  readonly toolInput: unknown;
  readonly toolResponse: string;
}

export interface UserPromptSubmitInput {
  readonly identity: HookIdentity;
  readonly prompt: string;
}

export interface SessionStartInput {
  readonly identity: HookIdentity;
}

export interface StopInput {
  readonly identity: HookIdentity;
}

export interface PreToolUseOutcome {
  readonly block: boolean;
  readonly reason: string | null;
}

export interface PostToolUseOutcome {
  readonly block: boolean;
  readonly reason: string | null;
  readonly additionalContext: string | null;
}

export interface UserPromptSubmitOutcome {
  readonly block: boolean;
  readonly reason: string | null;
  readonly additionalContext: string | null;
}

export interface HookRunner {
  preToolUse(input: PreToolUseInput): Promise<PreToolUseOutcome>;
  postToolUse(input: PostToolUseInput): Promise<PostToolUseOutcome>;
  userPromptSubmit(input: UserPromptSubmitInput): Promise<UserPromptSubmitOutcome>;
  sessionStart(input: SessionStartInput): Promise<void>;
  stop(input: StopInput): Promise<void>;
}

export interface HookCommandRequest {
  readonly command: string;
  readonly timeoutMs: number;
  readonly stdin: string;
  readonly cwd: string;
}

export interface HookCommandResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface CommandExecutor {
  execute(request: HookCommandRequest): Promise<HookCommandResult>;
}
