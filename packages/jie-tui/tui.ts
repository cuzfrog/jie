import { matchesKey, ProcessTerminal, TUI, type Terminal } from "@earendil-works/pi-tui";
import { Events, type EventEnvelope, type EventManager, type EventType, type Sender } from "@cuzfrog/jie-platform/event";
import { type AnyEventEnvelope, type TuiState, Actions, INITIAL_TUI_STATE, reduce } from "./state";
import { buildView, type BuildViewOpts } from "./components";

export interface CreateTUIOptions {
  eventManager: EventManager;
  cwd?: string;
  branch?: string;
  cols?: number;
  rows?: number;
  provider?: string;
  modelId?: string;
  effort?: string;
  terminal?: Terminal;
}

export interface Tui {
  getState: () => TuiState;
  submit: (text: string) => void;
  start: () => Promise<void>;
  stop: () => void;
}

const DEFAULT_COLS = 80;
const MIN_COLS = 60;

export function createTui(options: CreateTUIOptions): Tui {
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
  const buildViewOpts: BuildViewOpts = {
    cwd,
    branch,
    provider: options.provider ?? "",
    modelId: options.modelId ?? "",
    effort: options.effort ?? "",
  };

  const dispatch = (action: ReturnType<typeof Actions[keyof typeof Actions]>, render: () => void = () => {}): void => {
    if (stopped) return;
    state = reduce(state, action);
    render();
  };

  const emitTransient = (text: string): void => dispatch(Actions.setTransientMessage(text));
  const emitError = (text: string): void => dispatch(Actions.setErrorMessage(text));

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
      emitError("No focused agent; press ctrl+left to reveal the rail.");
      return;
    }
    const sender: Sender = { kind: "user" };
    options.eventManager.publish(Events.userPrompt(sender, state.teamId, text, targetKey));
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

  const subscribedTopics = [
    "system.team.loaded",
    "system.team.interrupted",
    "system.error",
    "user.prompt",
    "agent.turn.start",
    "agent.idle",
    "agent.stream.chunk",
    "agent.stream.end",
    "agent.tool.call",
    "agent.tool.result",
  ] as const;

  const onBusEvent = (env: AnyEventEnvelope): void => {
    dispatch(Actions.receiveEvent(env));
  };
  const busUnsubscribes: Array<() => void> = [];
  for (const topic of subscribedTopics) {
    busUnsubscribes.push(options.eventManager.subscribe(topic, onBusEvent as (env: EventEnvelope<EventType>) => void));
  }
  let busUnsubscribed = false;
  const unsubscribeBus = (): void => {
    if (busUnsubscribed) return;
    busUnsubscribed = true;
    for (const unsub of busUnsubscribes) unsub();
  };

  let resolveStart: (() => void) | null = null;

  const start = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const terminal = options.terminal ?? new ProcessTerminal();
      const tui = new TUI(terminal);
      const { root } = buildView(state, buildViewOpts, tui);
      tui.addChild(root);
      const requestRender = (): void => tui.requestRender();

      tui.addInputListener((data) => {
        if (matchesKey(data, "ctrl+left")) {
          dispatch(Actions.toggleTeamRail(), requestRender);
          return { consume: true };
        }
        if (matchesKey(data, "ctrl+up")) {
          dispatch(Actions.switchCycleAgent(-1), requestRender);
          return { consume: true };
        }
        if (matchesKey(data, "ctrl+down")) {
          dispatch(Actions.switchCycleAgent(1), requestRender);
          return { consume: true };
        }
        return undefined;
      });

      resolveStart = (): void => {
        unsubscribeBus();
        tui.stop();
        resolveStart = null;
        resolve();
      };

      try {
        tui.start();
      } catch (error) {
        unsubscribeBus();
        resolveStart = null;
        throw error;
      }
    });
  };

  return {
    getState: (): TuiState => state,
    submit: (text: string): void => handleSubmit(text),
    stop: (): void => {
      stopped = true;
      unsubscribeBus();
      if (resolveStart !== null) {
        resolveStart();
      }
    },
    start,
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
