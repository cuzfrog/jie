import { ProcessTerminal, TUI, detectCapabilities, setCapabilities, type Terminal } from "@earendil-works/pi-tui";
import { logger, type AnyEventEnvelope, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type TuiState, type StateStore, createStateStore } from "./state";
import { createTuiCommandHandler, type CommandHandler } from "./command-handler";
import { createStreamTerminal } from "./stream-terminal";
import { createTuiView, type TuiView } from "./components";

const SUBMIT_EDITOR_TEXT = Actions.submitEditorText("").type;
const REQUEST_INTERRUPT = Actions.requestInterrupt("", "").type;
const REQUEST_QUIT = Actions.requestQuit().type;
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
  private view: TuiView | null = null;
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
        this.view = createTuiView({ tui: ui, stateStore: this.stateStore, platform: this.deps.platform, cwd: this.cwd });
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
    if (this.view !== null) {
      this.view.stop();
      this.view = null;
    }
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
