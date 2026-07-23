import { ProcessTerminal, TUI, detectCapabilities, setCapabilities, type Terminal } from "@earendil-works/pi-tui";
import { logger, type AnyEventEnvelope, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type StateStore, type TuiState } from "./state";
import type { CommandHandler } from "./command-handler";
import type { TuiView } from "./components";

const SUBMIT_EDITOR_TEXT = Actions.submitEditorText("").type;
const REQUEST_INTERRUPT = Actions.requestInterrupt("", "").type;
const REQUEST_QUIT = Actions.requestQuit().type;
const log = logger.getSubLogger({ name: "jie.tui" });

export type TuiStdout = NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number };

export interface TuiDeps {
  readonly platform: JiePlatform;
  readonly stdin?: NodeJS.ReadableStream;
  readonly stdout?: TuiStdout;
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

export class TuiImpl implements Tui {
  private readonly platform: JiePlatform;
  private readonly stateStore: StateStore;
  private readonly commandHandler: CommandHandler;
  private readonly viewFactory: (tui: TUI) => TuiView;
  private readonly terminalFactory: (stdin: NodeJS.ReadableStream, stdout: TuiStdout) => Terminal;
  private readonly stdin: NodeJS.ReadableStream | undefined;
  private readonly stdout: TuiStdout | undefined;
  private readonly unsubscribeBus: () => void;
  private readonly unsubscribeActions: () => void;
  private terminal: Terminal | null = null;
  private ui: TUI | null = null;
  private view: TuiView | null = null;
  private resolveStart: (() => void) | null = null;

  constructor(
    platform: JiePlatform,
    stateStore: StateStore,
    commandHandler: CommandHandler,
    viewFactory: (tui: TUI) => TuiView,
    terminalFactory: (stdin: NodeJS.ReadableStream, stdout: TuiStdout) => Terminal,
    stdin: NodeJS.ReadableStream | undefined = undefined,
    stdout: TuiStdout | undefined = undefined,
  ) {
    this.platform = platform;
    this.stateStore = stateStore;
    this.commandHandler = commandHandler;
    this.viewFactory = viewFactory;
    this.terminalFactory = terminalFactory;
    this.stdin = stdin;
    this.stdout = stdout;
    this.unsubscribeBus = subscribeToBus(platform, (env) => {
      this.stateStore.dispatch(Actions.receiveEvent(env));
    });
    this.unsubscribeActions = stateStore.subscribe(async (action) => {
      if (action.type === SUBMIT_EDITOR_TEXT) {
        this.commandHandler.handle(action.payload.text);
        return;
      }
      if (action.type === REQUEST_INTERRUPT) {
        this.platform.interrupt(action.payload.teamId, action.payload.agentKey);
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
      const stdout = this.stdout ?? process.stdout;
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
        const stdin = this.stdin ?? process.stdin;
        const terminal: Terminal = this.stdin === undefined ? new ProcessTerminal() : this.terminalFactory(stdin, stdout);
        const ui = new TUI(terminal);
        this.view = this.viewFactory(ui);
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
