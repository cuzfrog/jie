import type { EventManager, Sender } from "@cuzfrog/jie-platform/event";
import { EventTypes, Events } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";
import { type AnyEventEnvelope, type TuiState, Actions, INITIAL_TUI_STATE, reduce } from "./state";
import { render, type RenderOptions } from "./renderer";

export interface StartTUIOptions {
  bus: EventManager;
  artifacts: ArtifactStore;
  roles: string[];
  cwd?: string;
  branch?: string;
  cols?: number;
  rows?: number;
  provider?: string;
  modelId?: string;
  effort?: string;
}

export interface Tui {
  getState: () => TuiState;
  frame: () => string[];
  submit: (text: string) => void;
  injectKey: (data: string) => void;
  stop: () => void;
}

const DEFAULT_COLS = 80;
const MIN_COLS = 60;

export function startTUI(options: StartTUIOptions): Tui {
  if (process.stdin.isTTY !== true) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if ((options.cols ?? DEFAULT_COLS) < MIN_COLS) {
    throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${options.cols ?? 0}`);
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }

  const replyForSlashCommand = (text: string): string | null => {
    const parts = text.split(/\s+/);
    const command = parts[0]!;
    switch (command) {
      case "/help":
        return "type a prompt...  /clear /help /exit /team /model /login /logout";
      case "/login":
        return "/login: provider picker not wired in v0.2.0 MVP. Use `jie login --provider <id> --api-key <key>` then restart.";
      case "/logout":
        return "/logout: not wired in v0.2.0 MVP. Use `jie logout [<provider>].";
      case "/model":
        return "/model: not wired in v0.2.0 MVP. Use `jie model <provider>/<modelId>`.";
      case "/team": {
        const argument = parts[1];
        if (argument === undefined) return "/team <id>: picker not wired in v0.2.0 MVP. Use `jie team <id>` then restart.";
        if (argument === "--unset") return "/team --unset: not wired in v0.2.0 MVP. Use `jie team --unset`.";
        return teamNotInstalledReply(argument);
      }
      default:
        return null;
    }
  };

  let state: TuiState = INITIAL_TUI_STATE;
  let stopped = false;
  const cwd = options.cwd ?? process.cwd();
  const branch = options.branch ?? detectBranch(cwd);
  const cols = options.cols ?? DEFAULT_COLS;
  const rows = options.rows ?? 30;
  const renderOpts: RenderOptions = {
    cols, rows, cwd, branch,
    provider: options.provider, modelId: options.modelId, effort: options.effort,
  };

  const dispatch = (action: ReturnType<typeof Actions[keyof typeof Actions]>): void => {
    if (stopped) return;
    state = reduce(state, action);
  };

  const emitTransient = (text: string): void => dispatch(Actions.setTransientMessage(text, Date.now()));
  const emitError = (text: string): void => dispatch(Actions.setErrorMessage(text, Date.now()));

  const handleSlashCommand = (text: string): boolean => {
    dispatch(Actions.clearTransientMessage());
    const parts = text.split(/\s+/);
    const command = parts[0]!;
    if (command === "/clear") {
      dispatch(Actions.clearTuiState());
      return true;
    }
    if (command === "/exit") {
      stopped = true;
      return true;
    }
    const reply = replyForSlashCommand(text);
    if (reply === null) {
      emitError(`unknown slash command: ${command}`);
      return true;
    }
    emitTransient(reply);
    return true;
  };

  const publishPrompt = (text: string): void => {
    if (state.teamId === null || state.focusedAgentId === null) {
      emitError("No team loaded; run `/team <id>` to load a team.");
      return;
    }
    const focused = state.agents.get(state.focusedAgentId);
    const targetKey = focused?.agentKey ?? (state.leaderAgentId !== null ? state.agents.get(state.leaderAgentId)?.agentKey : undefined);
    if (targetKey === undefined) {
      emitError("No focused agent; press <- <- to reveal the rail.");
      return;
    }
    const sender: Sender = { kind: "user" };
    options.bus.publish(Events.userPrompt(sender, state.teamId, text, targetKey));
  };

  const handleSubmit = (text: string): void => {
    dispatch(Actions.clearTransientMessage());
    dispatch(Actions.clearErrorMessage());
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      handleSlashCommand(trimmed);
      return;
    }
    publishPrompt(trimmed);
  };

  const onBusEvent = (env: AnyEventEnvelope): void => {
    if (stopped) return;
    dispatch(Actions.receiveEvent(env));
  };

  options.bus.subscribe(EventTypes.SYSTEM_TEAM_LOADED, onBusEvent);
  options.bus.subscribe(EventTypes.SYSTEM_TEAM_INTERRUPTED, onBusEvent);
  options.bus.subscribe(EventTypes.SYSTEM_ERROR, onBusEvent);
  options.bus.subscribe(EventTypes.USER_PROMPT, onBusEvent);
  options.bus.subscribe(EventTypes.AGENT_TURN_START, onBusEvent);
  options.bus.subscribe(EventTypes.AGENT_IDLE, onBusEvent);
  options.bus.subscribe(EventTypes.AGENT_STREAM_CHUNK, onBusEvent);
  options.bus.subscribe(EventTypes.AGENT_STREAM_END, onBusEvent);
  options.bus.subscribe(EventTypes.AGENT_TOOL_CALL, onBusEvent);
  options.bus.subscribe(EventTypes.AGENT_TOOL_RESULT, onBusEvent);

  let leftArrowCount = 0;

  const handleOneKey = (data: string): void => {
    if (stopped) return;
    if (data === "\x04") {
      stopped = true;
      return;
    }
    if (data === "\x1b[D") {
      leftArrowCount += 1;
      if (leftArrowCount >= 2) {
        leftArrowCount = 0;
        dispatch(Actions.toggleTeamRail());
      }
      return;
    }
    leftArrowCount = 0;
    if (data === "\x1b[1;5A") {
      dispatch(Actions.switchCycleAgent(-1));
      return;
    }
    if (data === "\x1b[1;5B") {
      dispatch(Actions.switchCycleAgent(1));
      return;
    }
    if (data === "\x14") {
      dispatch(Actions.toggleThinkingBlock());
      return;
    }
    if (data === "\x0f") {
      dispatch(Actions.toggleToolCallBlock());
      return;
    }
  };

  const injectKey = (data: string): void => {
    if (stopped) return;
    let i = 0;
    while (i < data.length) {
      if (data[i] === "\x1b" && i + 1 < data.length && data[i + 1] === "[") {
        const match = data.slice(i).match(/^\x1b\[[0-9;]*[A-Za-z]/);
        if (match !== null) {
          handleOneKey(match[0]);
          i += match[0].length;
          continue;
        }
      }
      handleOneKey(data[i]!);
      i += 1;
    }
  };

  return {
    getState: (): TuiState => state,
    frame: (): string[] => render(state, renderOpts, Date.now()).lines,
    submit: (text: string): void => handleSubmit(text),
    injectKey,
    stop: (): void => {
      stopped = true;
    },
  };
}

function detectBranch(cwd: string): string {
  try {
    const spawn = Bun.spawnSync({ cmd: ["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"], stdout: "pipe", stderr: "pipe" });
    if (spawn.exitCode !== 0) return "";
    return new TextDecoder().decode(spawn.stdout).trim();
  } catch {
    return "";
  }
}

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

function teamNotInstalledReply(argument: string): string {
  return `team '${argument}' is not installed; checked .jie/teams/${argument}/ and ~/.jie/teams/${argument}/`;
}