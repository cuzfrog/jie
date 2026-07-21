import { Container, Loader, ProcessTerminal, TUI, detectCapabilities, setCapabilities, type OverlayHandle, type Terminal } from "@earendil-works/pi-tui";
import { logger, type AnyEventEnvelope, type JiePlatform, type SessionSummary } from "@cuzfrog/jie-platform";
import { Actions, TuiState, type StateStore, createStateStore } from "./state";
import { createTuiCommandHandler, type CommandHandler } from "./command-handler";
import { createStreamTerminal } from "./stream-terminal";
import { createChatSync } from "./sync";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, SessionPicker, StatusLine, TodoList, WORKING_LABEL, style } from "./components";
import { Footer } from "./components/footer";
import { createJieEditor } from "./components/editor";

const SUBMIT_EDITOR_TEXT = Actions.submitEditorText("").type;
const REQUEST_INTERRUPT = Actions.requestInterrupt("", "").type;
const REQUEST_QUIT = Actions.requestQuit().type;
const SELECT_PICKED_SESSION = Actions.selectPickedSession("", "").type;
const OPEN_SESSION_PICKER = Actions.openSessionPicker([]).type;
const CLOSE_SESSION_PICKER = Actions.closeSessionPicker().type;
const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CYCLE_PREV_KEYS = new Set<string>(["\x1b[1;2A", "\x1b[1;5A"]);
const CYCLE_NEXT_KEYS = new Set<string>(["\x1b[1;2B", "\x1b[1;5B"]);
const CONSUMED = { consume: true } as const;
const log = logger.getSubLogger({ name: "jie.tui" });

export interface TuiDeps {
  readonly platform: JiePlatform;
  readonly stdin?: NodeJS.ReadableStream;
  readonly stdout?: NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number };
  readonly stderr?: NodeJS.WritableStream;
  readonly gitBranch?: string;
  readonly gitDirty?: boolean;
}

export interface CreateTUIOptions {
  readonly cwd: string;
  readonly rows?: number;
}

export interface Tui {
  /** visibleForTesting */
  readonly state: TuiState;
  start(): Promise<void>;
  stop(): void;
}

const MIN_COLS = 60;

export function createTui(options: CreateTUIOptions, deps: TuiDeps): Tui {
  if (process.stdin.isTTY !== true && deps.stdin === undefined) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }
  const stateStore = createStateStore();
  const commandHandler = createTuiCommandHandler({ stateStore, platform: deps.platform });
  stateStore.dispatch(Actions.setEnvironment(options.cwd, deps.gitBranch ?? "", deps.gitDirty ?? false));
  return new PiTui(options, deps, stateStore, commandHandler);
}

class PiTui implements Tui {
  private readonly cwd: string;
  private readonly deps: TuiDeps;
  private readonly stateStore: StateStore;
  private readonly commandHandler: CommandHandler;
  private readonly unsubscribeBus: () => void;
  private readonly unsubscribeActions: () => void;
  private terminal: Terminal | null = null;
  private ui: TUI | null = null;
  private unsubscribeChatSync: () => void = noop;
  private unsubscribeKeys: () => void = noop;
  private sessionPickerHandle: OverlayHandle | null = null;
  private workingSlot: Container | null = null;
  private workingIndicator: Loader | null = null;
  private resolveStart: (() => void) | null = null;

  constructor(options: CreateTUIOptions, deps: TuiDeps, stateStore: StateStore, commandHandler: CommandHandler) {
    this.cwd = options.cwd;
    this.deps = deps;
    this.stateStore = stateStore;
    this.commandHandler = commandHandler;
    this.unsubscribeBus = subscribeToBus(this.deps.platform, (env) => {
      this.stateStore.dispatch(Actions.receiveEvent(env));
    });
    this.unsubscribeActions = stateStore.subscribe(async (action) => {
      this.syncWorkingIndicator();
      if (action.type === SUBMIT_EDITOR_TEXT) {
        this.commandHandler.handle(action.payload.text);
        return;
      }
      if (action.type === REQUEST_INTERRUPT) {
        this.deps.platform.interrupt(action.payload.teamId, action.payload.agentKey);
        return;
      }
      if (action.type === REQUEST_QUIT) {
        await this.quit();
        return;
      }
      if (action.type === SELECT_PICKED_SESSION) {
        this.hideSessionPicker();
        this.stateStore.dispatch(Actions.closeSessionPicker());
        await this.handleResumePickedSession(action.payload.teamId, action.payload.sessionId);
        return;
      }
      if (action.type === OPEN_SESSION_PICKER) {
        this.showSessionPicker(action.payload.sessions);
        return;
      }
      if (action.type === CLOSE_SESSION_PICKER) {
        this.hideSessionPicker();
        return;
      }
    });
  }

  get state(): TuiState {
    return this.stateStore.getState();
  }

  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      const stdout = this.deps.stdout ?? process.stdout;
      const cols = stdout.columns;
      if (cols !== undefined && cols < MIN_COLS) {
        throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${cols}`);
      }
      this.resolveStart = (): void => {
        this.resolveStart = null;
        resolve();
      };
      try {
        setCapabilities({ ...detectCapabilities(), hyperlinks: process.env.INK_OSC8 === "1" });
        const stdin = this.deps.stdin ?? process.stdin;
        const terminal: Terminal = this.deps.stdin === undefined ? new ProcessTerminal() : createStreamTerminal(stdin, stdout);
        const ui = new TUI(terminal);
        const chatContainer = new Container();
        const editor = createJieEditor(ui, this.stateStore, this.cwd);
        const workingSlot = new Container();
        const workingIndicator = new Loader(ui, style("accent"), style("muted"), WORKING_LABEL, { frames: [...SPINNER_FRAMES], intervalMs: SPINNER_INTERVAL_MS });
        ui.addChild(chatContainer);
        ui.addChild(new TodoList(this.stateStore));
        ui.addChild(workingSlot);
        ui.addChild(new StatusLine(this.stateStore));
        ui.addChild(editor);
        ui.addChild(new Footer(this.stateStore));
        ui.setFocus(editor);
        this.workingSlot = workingSlot;
        this.workingIndicator = workingIndicator;
        this.unsubscribeKeys = ui.addInputListener((data) => this.handleGlobalKey(data));
        this.unsubscribeChatSync = createChatSync(this.stateStore, chatContainer, () => {
          ui.requestRender();
        });
        this.terminal = terminal;
        this.ui = ui;
        ui.start();
      } catch (error) {
        this.resolveStart = null;
        throw error;
      }
    });
  }

  stop(): void {
    if (this.ui !== null) {
      try {
        this.ui.stop();
      } catch {
        log.error("failed to stop tui");
      }
      this.ui = null;
      this.terminal = null;
    }
    this.sessionPickerHandle = null;
    if (this.workingIndicator !== null) {
      this.workingIndicator.stop();
      this.workingIndicator = null;
    }
    this.workingSlot = null;
    this.unsubscribeChatSync();
    this.unsubscribeKeys();
    this.unsubscribeBus();
    this.unsubscribeActions();
    this.resolveStart?.();
  }

  private async quit(): Promise<void> {
    if (this.terminal !== null) {
      await this.terminal.drainInput();
    }
    this.stop();
  }

  private handleGlobalKey(data: string): typeof CONSUMED | undefined {
    if (data === CTRL_T) {
      this.stateStore.dispatch(Actions.toggleThinking());
      return CONSUMED;
    }
    if (data === CTRL_O) {
      this.stateStore.dispatch(Actions.toggleToolCards());
      return CONSUMED;
    }
    if (CYCLE_PREV_KEYS.has(data)) {
      this.stateStore.dispatch(Actions.switchCycleAgent(-1));
      return CONSUMED;
    }
    if (CYCLE_NEXT_KEYS.has(data)) {
      this.stateStore.dispatch(Actions.switchCycleAgent(1));
      return CONSUMED;
    }
    return undefined;
  }

  private syncWorkingIndicator(): void {
    if (this.workingSlot === null || this.workingIndicator === null) return;
    const busy = TuiState.isBusy(this.stateStore.getState());
    const mounted = this.workingSlot.children.length > 0;
    if (busy && !mounted) {
      this.workingSlot.addChild(this.workingIndicator);
      this.workingIndicator.start();
    } else if (!busy && mounted) {
      this.workingIndicator.stop();
      this.workingSlot.removeChild(this.workingIndicator);
    }
  }

  private showSessionPicker(sessions: ReadonlyArray<SessionSummary>): void {
    if (this.ui === null) return;
    const teamId = this.stateStore.getState().teamId;
    if (teamId === null) return;
    const picker = new SessionPicker(sessions, this.stateStore, {
      onSelect: (sessionId) => {
        this.stateStore.dispatch(Actions.selectPickedSession(teamId, sessionId));
      },
      onCancel: () => {
        this.stateStore.dispatch(Actions.closeSessionPicker());
      },
    });
    this.sessionPickerHandle = this.ui.showOverlay(picker, { width: "100%", maxHeight: "60%" });
  }

  private hideSessionPicker(): void {
    if (this.sessionPickerHandle !== null) {
      this.sessionPickerHandle.hide();
      this.sessionPickerHandle = null;
    }
  }

  private async handleResumePickedSession(teamId: string, sessionId: string): Promise<void> {
    try {
      const identity = await this.deps.platform.execute({ name: "resumeSession", teamId, sessionId });
      this.stateStore.dispatch(Actions.switchTeam(identity));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.stateStore.dispatch(Actions.setErrorMessage(`/resume failed: ${reason}`));
    }
  }
}

function subscribeToBus(platform: JiePlatform, onEvent: (event: AnyEventEnvelope) => void): () => void {
  const unsubscribes: Array<() => void> = [
    platform.subscribe("system.team.loaded", onEvent),
    platform.subscribe("system.error", onEvent),
    platform.subscribe("user.prompt", onEvent),
    platform.subscribe("agent.model.assigned", onEvent),
    platform.subscribe("agent.prompt.queue.update", onEvent),
    platform.subscribe("agent.turn.start", onEvent),
    platform.subscribe("agent.idle", onEvent),
    platform.subscribe("agent.stream.chunk", onEvent),
    platform.subscribe("agent.tool.call", onEvent),
    platform.subscribe("agent.tool.result", onEvent),
    platform.subscribe("agent.usage", onEvent),
  ];
  let unsubscribed = false;
  return (): void => {
    if (unsubscribed) return;
    unsubscribed = true;
    for (const unsub of unsubscribes) unsub();
  };
}

function isUtf8(): boolean {
  return /utf-?8/i.test(process.env.LANG ?? process.env.LC_ALL ?? "");
}

function noop(): void {}
