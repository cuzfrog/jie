import { ProcessTerminal, TUI, type Terminal } from "@earendil-works/pi-tui";
import { Events, type EventEnvelope, type EventManager, type EventType, type Sender } from "@cuzfrog/jie-platform/event";
import { type AuthStore, type Scope, type SettingsStore } from "@cuzfrog/jie-platform/config";
import { type TeamRegistry } from "@cuzfrog/jie-platform/team";
import { type AnyEventEnvelope, type TuiState, Actions, INITIAL_TUI_STATE, reduce, TuiStateSelectors } from "./state";
import { createTuiCommandHandler, type TuiCommandHandler } from "./command-handler";
import { createKeyboardHandler } from "./keyboard-handler";
import { type GitService } from "@cuzfrog/jie-platform/services";
import { buildView, type BuildViewResult } from "./components";

export interface TuiDeps {
  eventManager: EventManager;
  teamRegistry: TeamRegistry;
  loadTeam: (teamId: string) => Promise<void>;
  authStore: AuthStore;
  gitService: GitService;
  settingsStore: SettingsStore;
  settingsScope: Scope;
}

export interface CreateTUIOptions {
  cwd: string;
  rows?: number;
  terminal?: Terminal;
}

export interface Tui {
  getState: () => TuiState;
  submit: (text: string) => void;
  start: () => Promise<void>;
  stop: () => void;
}

const MIN_COLS = 60;
const GIT_REFRESH_MIN_INTERVAL_MS = 500;

export function createTui(deps: TuiDeps, options: CreateTUIOptions): Tui {
  if (process.stdin.isTTY !== true) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }

  let state: TuiState = INITIAL_TUI_STATE;
  const cwd = options.cwd;
  const gitService: GitService = deps.gitService;
  let lastGitRefreshAt = 0;
  let cachedGit = gitService.getSnapshot();
  const refreshGitIfStale = (now: number): void => {
    if (now - lastGitRefreshAt < GIT_REFRESH_MIN_INTERVAL_MS) return;
    lastGitRefreshAt = now;
    cachedGit = gitService.getSnapshot();
  };

  const lifecycle: { stopped: boolean; resolveStart: (() => void) | null; render: (() => void) | null; commandHandler: TuiCommandHandler | null } = {
    stopped: false,
    resolveStart: null,
    render: null,
    commandHandler: null,
  };

  const dispatch = (action: ReturnType<typeof Actions[keyof typeof Actions]>): void => {
    if (lifecycle.stopped) return;
    state = reduce(state, action);
    lifecycle.render?.();
  };

  const isBusy = (): boolean => {
    for (const agent of state.agents.values()) {
      if (agent.status === "busy") return true;
    }
    return false;
  };

  const requestQuit = (): void => {
    if (isBusy()) {
      dispatch(Actions.setPendingQuit(true));
      return;
    }
    lifecycle.stopped = true;
    lifecycle.resolveStart?.();
  };

  const confirmQuit = (): void => {
    dispatch(Actions.setPendingQuit(false));
    lifecycle.stopped = true;
    lifecycle.resolveStart?.();
  };

  const cancelQuit = (): void => {
    dispatch(Actions.setPendingQuit(false));
  };

  const publishPrompt = (text: string): void => {
    if (state.teamId === null || state.focusedAgentId === null) {
      dispatch(Actions.setErrorMessage("No team loaded; run `/team <id>` to load a team."));
      return;
    }
    const target = TuiStateSelectors.getTargetAgentForPrompt(state);
    if (target === null) {
      dispatch(Actions.setErrorMessage("No focused agent; press ctrl+left to reveal the rail."));
      return;
    }
    const sender: Sender = { kind: "user" };
    deps.eventManager.publish(Events.userPrompt(sender, state.teamId, text, target.agentKey));
  };

  const handleSubmit = (text: string): void => {
    dispatch(Actions.clearBanners());
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      lifecycle.commandHandler?.handle(trimmed);
      return;
    }
    publishPrompt(trimmed);
  };

  const subscribeToBus = (): (() => void) => {
    const onBusEvent = (env: EventEnvelope<EventType>): void => {
      dispatch(Actions.receiveEvent(env as AnyEventEnvelope));
    };
    const busUnsubscribes: Array<() => void> = [];
    for (const topic of SUBSCRIBED_TOPICS) {
      busUnsubscribes.push(deps.eventManager.subscribe(topic, onBusEvent));
    }
    let busUnsubscribed = false;
    return (): void => {
      if (busUnsubscribed) return;
      busUnsubscribed = true;
      for (const unsub of busUnsubscribes) unsub();
    };
  };
  const unsubscribeBus = subscribeToBus();

  const start = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const terminal = options.terminal ?? new ProcessTerminal();
      if (terminal.columns < MIN_COLS) {
        throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${terminal.columns}`);
      }
      const tui = new TUI(terminal);
      const { root, rail, chatPane, editor, statusBar, confirmExit } = buildView(state, { cwd }, tui);
      tui.addChild(root);
      const projectView = (view: BuildViewResult): void => {
        if (view.confirmExit.isVisible() !== state.pendingQuit) {
          view.confirmExit.setVisible(state.pendingQuit);
        }
        refreshGitIfStale(Date.now());
        const focused = TuiStateSelectors.getFocusedAgent(state);
        view.chatPane.setAgent(focused);
        view.editor.setQueueIndicator(formatQueueIndicator(focused?.queue ?? null));
        view.rail.setItemsFromState(state);
        view.statusBar.update({ cwd, git: cachedGit }, state);
      };
      const renderAll = (): void => {
        projectView({ root, rail, chatPane, editor, statusBar, confirmExit });
        tui.requestRender();
      };
      lifecycle.render = renderAll;
      lifecycle.commandHandler = createTuiCommandHandler({
        getState: () => state,
        dispatch,
        requestQuit,
        teamRegistry: deps.teamRegistry,
        loadTeam: deps.loadTeam,
        authStore: deps.authStore,
        settingsStore: deps.settingsStore,
        settingsScope: deps.settingsScope,
      });

      const keyboardHandler = createKeyboardHandler({
        eventManager: deps.eventManager,
        getState: () => state,
        dispatch,
        confirmQuit,
        cancelQuit,
        requestQuit,
        render: renderAll,
      });

      tui.addInputListener((data) => keyboardHandler.handle(data));

      lifecycle.resolveStart = (): void => {
        unsubscribeBus();
        tui.stop();
        lifecycle.resolveStart = null;
        resolve();
      };

      try {
        tui.start();
      } catch (error) {
        unsubscribeBus();
        lifecycle.resolveStart = null;
        throw error;
      }
    });
  };

  return {
    getState: (): TuiState => state,
    submit: (text: string): void => handleSubmit(text),
    stop: (): void => {
      lifecycle.stopped = true;
      unsubscribeBus();
      lifecycle.resolveStart?.();
      lifecycle.render = null;
      lifecycle.commandHandler = null;
      lifecycle.resolveStart = null;
      lastGitRefreshAt = 0;
    },
    start,
  };
}

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

const SUBSCRIBED_TOPICS = [
  "system.team.loaded",
  "system.team.interrupted",
  "system.error",
  "user.prompt",
  "agent.model.assigned",
  "agent.prompt.queue.update",
  "agent.turn.start",
  "agent.idle",
  "agent.stream.chunk",
  "agent.stream.end",
  "agent.tool.call",
  "agent.tool.result",
] as const;

const QUEUE_PREVIEW_MAX_CHARS = 100;

function formatQueueIndicator(queue: ReadonlyArray<string> | null): string | null {
  if (queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = next.length > QUEUE_PREVIEW_MAX_CHARS ? `${next.slice(0, QUEUE_PREVIEW_MAX_CHARS)}…` : next;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${preview}`;
}