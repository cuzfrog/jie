import { ProcessTerminal, TUI, type Terminal } from "@earendil-works/pi-tui";
import { Events, type EventEnvelope, type EventManager, type EventType, type Sender } from "@cuzfrog/jie-platform/event";
import { type AnyEventEnvelope, type TuiState, Actions, INITIAL_TUI_STATE, reduce } from "./state";
import { createTuiCommandHandler } from "./command-handler";
import { createKeyboardHandler } from "./keyboard";
import { createGitService, type GitService } from "./git-service";
import { buildView, type BuildViewOpts } from "./components";

export interface CreateTUIOptions {
  eventManager: EventManager;
  cwd?: string;
  gitService?: GitService;
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

export function createTui(options: CreateTUIOptions): Tui {
  if (process.stdin.isTTY !== true) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }

  let state: TuiState = INITIAL_TUI_STATE;
  let stopped = false;
  const cwd = options.cwd ?? process.cwd();
  const gitService: GitService = options.gitService ?? createGitService({ cwd });
  const buildViewOpts: BuildViewOpts = {
    cwd,
    git: gitService.getSnapshot(),
  };

  const dispatch = (action: ReturnType<typeof Actions[keyof typeof Actions]>): void => {
    if (stopped) return;
    state = reduce(state, action);
  };

  const isBusy = (): boolean => {
    for (const agent of state.agents.values()) {
      if (agent.status === "busy") return true;
    }
    return false;
  };

  let resolveStart: (() => void) | null = null;

  const requestQuit = (): void => {
    if (isBusy()) {
      dispatch(Actions.setPendingQuit(true));
      return;
    }
    stopped = true;
    if (resolveStart !== null) resolveStart();
  };

  const confirmQuit = (): void => {
    dispatch(Actions.setPendingQuit(false));
    stopped = true;
    if (resolveStart !== null) resolveStart();
  };

  const cancelQuit = (): void => {
    dispatch(Actions.setPendingQuit(false));
  };

  const commandHandler = createTuiCommandHandler({
    getState: () => state,
    dispatch,
    requestQuit,
  });

  const publishPrompt = (text: string): void => {
    if (state.teamId === null || state.focusedAgentId === null) {
      dispatch(Actions.setErrorMessage("No team loaded; run `/team <id>` to load a team."));
      return;
    }
    const focused = state.agents.get(state.focusedAgentId);
    const targetKey = focused?.agentKey ?? (state.leaderAgentId !== null ? state.agents.get(state.leaderAgentId)?.agentKey : undefined);
    if (targetKey === undefined) {
      dispatch(Actions.setErrorMessage("No focused agent; press ctrl+left to reveal the rail."));
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
      commandHandler.handle(trimmed);
      return;
    }
    publishPrompt(trimmed);
  };

  const subscribedTopics = [
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

  const start = (): Promise<void> => {
    return new Promise<void>((resolve) => {
      const terminal = options.terminal ?? new ProcessTerminal();
      if (terminal.columns < MIN_COLS) {
        throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${terminal.columns}`);
      }
      const tui = new TUI(terminal);
      const { root, rail, chatPane, editor, statusBar, confirmExit } = buildView(state, buildViewOpts, tui);
      tui.addChild(root);
      const requestRender = (): void => tui.requestRender();
      const renderAll = (): void => {
        if (confirmExit.isVisible() !== state.pendingQuit) {
          confirmExit.setVisible(state.pendingQuit);
        }
        const focused = state.focusedAgentId === null ? null : state.agents.get(state.focusedAgentId) ?? null;
        chatPane.setAgent(focused);
        editor.setQueueIndicator(formatQueueIndicator(focused?.queue ?? null));
        rail.setItemsFromState(state);
        statusBar.setFromOptsAndState(buildViewOpts, state);
        requestRender();
      };

      const keyboardHandler = createKeyboardHandler({
        eventManager: options.eventManager,
        getState: () => state,
        dispatch,
        confirmQuit,
        cancelQuit,
        requestQuit,
        render: renderAll,
      });

      tui.addInputListener((data) => keyboardHandler.handle(data));

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

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

const QUEUE_PREVIEW_MAX_CHARS = 100;

function formatQueueIndicator(queue: ReadonlyArray<string> | null): string | null {
  if (queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = next.length > QUEUE_PREVIEW_MAX_CHARS ? `${next.slice(0, QUEUE_PREVIEW_MAX_CHARS)}…` : next;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${preview}`;
}