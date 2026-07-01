import { matchesKey, ProcessTerminal, TUI, type Terminal } from "@earendil-works/pi-tui";
import type { EventEnvelope, EventManager, EventType, Sender } from "@cuzfrog/jie-platform/event";
import { Events } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";
import { type AnyEventEnvelope, type TuiState, Actions, INITIAL_TUI_STATE, reduce } from "./state";
import { buildView, type BuildViewOpts } from "./components/build-view";

export interface CreateTUIOptions {
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

  const dispatch = (action: ReturnType<typeof Actions[keyof typeof Actions]>): void => {
    if (stopped) return;
    state = reduce(state, action);
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

  let resolveStart: (() => void) | null = null;

  const start = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const terminal = options.terminal ?? new ProcessTerminal();
      const tui = new TUI(terminal);
      const { root } = buildView(state, buildViewOpts, tui);
      tui.addChild(root);

      tui.addInputListener((data) => {
        if (matchesKey(data, "ctrl+left")) {
          dispatch(Actions.toggleTeamRail());
          tui.requestRender();
          return { consume: true };
        }
        if (matchesKey(data, "ctrl+up")) {
          dispatch(Actions.switchCycleAgent(-1));
          tui.requestRender();
          return { consume: true };
        }
        if (matchesKey(data, "ctrl+down")) {
          dispatch(Actions.switchCycleAgent(1));
          tui.requestRender();
          return { consume: true };
        }
        return undefined;
      });

      const onRenderEvent = (env: EventEnvelope<EventType>): void => {
        onBusEvent(env as AnyEventEnvelope);
        tui.requestRender();
      };
      const subscriptions: Array<() => void> = [];
      for (const topic of subscribedTopics) {
        subscriptions.push(options.bus.subscribe(topic, onRenderEvent));
      }

      const cleanup = (): void => {
        for (const unsub of subscriptions) unsub();
      };

      resolveStart = (): void => {
        cleanup();
        tui.stop();
        resolveStart = null;
        resolve();
      };

      try {
        tui.start();
      } catch (error) {
        cleanup();
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
