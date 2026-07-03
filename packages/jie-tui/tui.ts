import { ProcessTerminal, TUI, type Terminal } from "@earendil-works/pi-tui";
import { Events, type EventEnvelope, type EventManager, type EventType, type Sender } from "@cuzfrog/jie-platform/event";
import { type AuthStore, type Scope, type SettingsStore } from "@cuzfrog/jie-platform/config";
import { type TeamRegistry } from "@cuzfrog/jie-platform/team";
import { type AnyEventEnvelope, type TuiState, Actions, INITIAL_TUI_STATE, reduce, TuiStateSelectors, type Action } from "./state";
import { createTuiCommandHandler, type TuiCommandHandler } from "./command-handler";
import { createKeyboardHandler, type KeyboardHandler } from "./keyboard-handler";
import { type GitService } from "@cuzfrog/jie-platform/services";
import { buildView, type BuildViewResult } from "./components";

export interface TuiDeps {
  readonly eventManager: EventManager;
  readonly teamRegistry: TeamRegistry;
  readonly loadTeam: (teamId: string) => Promise<void>;
  readonly authStore: AuthStore;
  readonly gitService: GitService;
  readonly settingsStore: SettingsStore;
  readonly settingsScope: Scope;
}

export interface CreateTUIOptions {
  readonly cwd: string;
  readonly rows?: number;
  readonly terminal?: Terminal;
}

export interface Tui {
  getState: () => TuiState;
  submit: (text: string) => void;
  start: () => Promise<void>;
  stop: () => void;
}

interface TuiOps {
  readonly getState: () => TuiState;
  readonly dispatch: (action: Action) => void;
  readonly requestQuit: () => void;
  readonly confirmQuit: () => void;
  readonly cancelQuit: () => void;
  readonly render: () => void;
}

interface TuiRuntimeServices {
  readonly eventManager: EventManager;
  readonly gitService: GitService;
}

interface PiTuiCtorOptions {
  readonly terminal: Terminal;
  readonly tui: TUI;
  readonly view: BuildViewResult;
  readonly cwd: string;
  readonly services: TuiRuntimeServices;
}

interface PiTuiBindings {
  readonly commandHandler: TuiCommandHandler;
  readonly keyboardHandler: KeyboardHandler;
  readonly unsubscribeBus: () => void;
}

export function createTui(deps: TuiDeps, options: CreateTUIOptions): Tui {
  if (process.stdin.isTTY !== true) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }
  const terminal = options.terminal ?? new ProcessTerminal();
  const tui = new TUI(terminal);
  const view = buildView(INITIAL_TUI_STATE, { cwd: options.cwd }, tui);
  tui.addChild(view.root);
  const piTui = new PiTui({
    terminal,
    tui,
    view,
    cwd: options.cwd,
    services: { eventManager: deps.eventManager, gitService: deps.gitService },
  });
  const ops = piTui.getOps();
  const commandHandler = createTuiCommandHandler({
    getState: ops.getState,
    dispatch: ops.dispatch,
    requestQuit: ops.requestQuit,
    teamRegistry: deps.teamRegistry,
    loadTeam: deps.loadTeam,
    authStore: deps.authStore,
    settingsStore: deps.settingsStore,
    settingsScope: deps.settingsScope,
  });
  const keyboardHandler = createKeyboardHandler({
    eventManager: deps.eventManager,
    getState: ops.getState,
    dispatch: ops.dispatch,
    confirmQuit: ops.confirmQuit,
    cancelQuit: ops.cancelQuit,
    requestQuit: ops.requestQuit,
    render: ops.render,
  });
  const unsubscribeBus = subscribeToBus(deps.eventManager, (env) => ops.dispatch(Actions.receiveEvent(env)));
  piTui.bind({ commandHandler, keyboardHandler, unsubscribeBus });
  return piTui;
}

const MIN_COLS = 60;

class PiTui implements Tui {
  private state: TuiState = INITIAL_TUI_STATE;
  private readonly terminal: Terminal;
  private readonly tui: TUI;
  private readonly view: BuildViewResult;
  private readonly cwd: string;
  private readonly services: TuiRuntimeServices;
  private readonly ops: TuiOps;
  private commandHandler: TuiCommandHandler = noopCommandHandler;
  private keyboardHandler: KeyboardHandler = noopKeyboardHandler;
  private unsubscribeBus: () => void = noopUnsubscribe;
  private stopped = false;
  private resolveStart: (() => void) | null = null;

  constructor(opts: PiTuiCtorOptions) {
    this.terminal = opts.terminal;
    this.tui = opts.tui;
    this.view = opts.view;
    this.cwd = opts.cwd;
    this.services = opts.services;
    this.ops = {
      getState: () => this.state,
      dispatch: (action) => this.dispatch(action),
      requestQuit: () => this.requestQuit(),
      confirmQuit: () => this.confirmQuit(),
      cancelQuit: () => this.cancelQuit(),
      render: () => this.renderAll(),
    };
  }

  bind(bindings: PiTuiBindings): void {
    this.commandHandler = bindings.commandHandler;
    this.keyboardHandler = bindings.keyboardHandler;
    this.unsubscribeBus = bindings.unsubscribeBus;
  }

  getOps(): TuiOps {
    return this.ops;
  }

  getState(): TuiState {
    return this.state;
  }

  submit(text: string): void {
    this.dispatch(Actions.clearBanners());
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      this.commandHandler.handle(trimmed);
      return;
    }
    this.publishPrompt(trimmed);
  }

  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.terminal.columns < MIN_COLS) {
        throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${this.terminal.columns}`);
      }
      this.tui.addInputListener((data) => this.keyboardHandler.handle(data));
      this.resolveStart = (): void => {
        this.resolveStart = null;
        resolve();
      };
      try {
        this.tui.start();
      } catch (error) {
        this.resolveStart = null;
        throw error;
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.unsubscribeBus();
    this.resolveStart?.();
    this.tui.stop();
  }

  private dispatch(action: Action): void {
    if (this.stopped) return;
    this.state = reduce(this.state, action);
    this.renderAll();
  }

  private isBusy(): boolean {
    for (const agent of this.state.agents.values()) {
      if (agent.status === "busy") return true;
    }
    return false;
  }

  private requestQuit(): void {
    if (this.isBusy()) {
      this.dispatch(Actions.setPendingQuit(true));
      return;
    }
    this.stopped = true;
    this.resolveStart?.();
  }

  private confirmQuit(): void {
    this.dispatch(Actions.setPendingQuit(false));
    this.stopped = true;
    this.resolveStart?.();
  }

  private cancelQuit(): void {
    this.dispatch(Actions.setPendingQuit(false));
  }

  private publishPrompt(text: string): void {
    if (this.state.teamId === null || this.state.focusedAgentId === null) {
      this.dispatch(Actions.setErrorMessage("No team loaded; run `/team <id>` to load a team."));
      return;
    }
    const target = TuiStateSelectors.getFocusedAgent(this.state);
    if (target === null) {
      this.dispatch(Actions.setErrorMessage("Team has no agent to address; load a valid team with `/team <id>`."));
      return;
    }
    const sender: Sender = { kind: "user" };
    this.services.eventManager.publish(Events.userPrompt(sender, this.state.teamId, text, target.agentKey));
  }

  private projectView(view: BuildViewResult): void {
    if (view.confirmExit.isVisible() !== this.state.pendingQuit) {
      view.confirmExit.setVisible(this.state.pendingQuit);
    }
    const focused = TuiStateSelectors.getFocusedAgent(this.state);
    view.chatPane.setAgent(focused);
    view.editor.setQueueIndicator(formatQueueIndicator(focused?.queue ?? null));
    view.rail.setItemsFromState(this.state);
    view.statusBar.update({ cwd: this.cwd, git: this.services.gitService.getSnapshot() }, this.state);
  }

  private renderAll(): void {
    this.projectView(this.view);
    this.tui.requestRender();
  }
}

const noopCommandHandler: TuiCommandHandler = { handle: () => undefined };
const noopKeyboardHandler: KeyboardHandler = { handle: () => undefined };
const noopUnsubscribe = (): void => undefined;

function subscribeToBus(eventManager: EventManager, onEvent: (env: AnyEventEnvelope) => void): () => void {
  const busUnsubscribes: Array<() => void> = [];
  for (const topic of SUBSCRIBED_TOPICS) {
    busUnsubscribes.push(eventManager.subscribe(topic, (env: EventEnvelope<EventType>) => onEvent(env as AnyEventEnvelope)));
  }
  let busUnsubscribed = false;
  return (): void => {
    if (busUnsubscribed) return;
    busUnsubscribed = true;
    for (const unsub of busUnsubscribes) unsub();
  };
}

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

const SUBSCRIBED_TOPICS: ReadonlyArray<EventType> = [
  "system.team.loaded",
  "system.interrupted",
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
];

const QUEUE_PREVIEW_MAX_CHARS = 100;

function formatQueueIndicator(queue: ReadonlyArray<string> | null): string | null {
  if (queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = next.length > QUEUE_PREVIEW_MAX_CHARS ? `${next.slice(0, QUEUE_PREVIEW_MAX_CHARS)}…` : next;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${preview}`;
}
