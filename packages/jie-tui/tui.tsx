import type { WriteStream, ReadStream } from "node:tty";
import { render } from "@cuzfrog/jie-ink";
import { logger, type AnyEventEnvelope, type EventEnvelope, type EventType, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type TuiState, type StateStore, createStateStore } from "./state";
import { createTuiCommandHandler, type CommandHandler } from "./command-handler";
import { App } from "./components";

const SUBMIT_EDITOR_TEXT = Actions.submitEditorText("").type;
const REQUEST_INTERRUPT = Actions.requestInterrupt("", "").type;
const SELECT_PICKED_SESSION = Actions.selectPickedSession("", "").type;
const log = logger.getSubLogger({ name: "jie.tui" });

export interface TuiDeps {
  readonly platform: JiePlatform;
  readonly stdin?: ReadStream;
  readonly stdout?: WriteStream;
  readonly stderr?: WriteStream;
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
  return new InkTui(options, deps, stateStore, commandHandler);
}

class InkTui implements Tui {
  private readonly deps: TuiDeps;
  private readonly stateStore: StateStore;
  private readonly commandHandler: CommandHandler;
  private readonly unsubscribeBus: () => void;
  private readonly unsubscribeActions: () => void;
  private inkInstance: ReturnType<typeof render> | null = null;
  private resolveStart: (() => void) | null = null;

  constructor(
    _options: CreateTUIOptions,
    deps: TuiDeps,
    stateStore: StateStore,
    commandHandler: CommandHandler,
  ) {
    this.deps = deps;
    this.stateStore = stateStore;
    this.commandHandler = commandHandler;
    this.unsubscribeBus = subscribeToBus(this.deps.platform, (env) => {
      this.stateStore.dispatch(Actions.receiveEvent(env as AnyEventEnvelope));
    });
    this.unsubscribeActions = stateStore.subscribe(async (action, afterState) => {
      if (action.type === SUBMIT_EDITOR_TEXT) {
        await this.handleSubmitEditorText(action.payload.text, afterState);
        return;
      }
      if (action.type === REQUEST_INTERRUPT) {
        this.deps.platform.interrupt(action.payload.teamId, action.payload.agentKey);
        return;
      }
      if (action.type === SELECT_PICKED_SESSION) {
        await this.handleResumePickedSession(action.payload.teamId, action.payload.sessionId, afterState);
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
        const stdin = this.deps.stdin ?? process.stdin;
        const stderr = this.deps.stderr;
        const instance = render(<App stateStore={this.stateStore} />, {
          stdout,
          stdin,
          stderr,
          exitOnCtrlC: false,
          patchConsole: true,
          appendToScrollback: true,
          alternateScreen: true,
          interactive: true,
        });
        this.inkInstance = instance;
        void instance.waitUntilExit().then(() => this.resolveStart?.());
      } catch (error) {
        this.resolveStart = null;
        throw error;
      }
    });
  }

  stop(): void {
    if (this.inkInstance !== null) {
      try {
        this.inkInstance.unmount();
      } catch {
        log.error("failed to unmount ink");
      }
      this.inkInstance = null;
    }
    this.unsubscribeBus();
    this.unsubscribeActions();
    this.resolveStart?.();
  }

  private async handleSubmitEditorText(text: string, _afterState: TuiState): Promise<void> {
    this.commandHandler.handle(text);
  }

  private async handleResumePickedSession(teamId: string, sessionId: string, _afterState: TuiState): Promise<void> {
    try {
      const identity = await this.deps.platform.execute({ name: "resumeSession", teamId, sessionId });
      this.stateStore.dispatch(Actions.switchTeam(identity));
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.stateStore.dispatch(Actions.setErrorMessage(`/resume failed: ${reason}`));
    }
  }
}

function subscribeToBus(
  platform: JiePlatform,
  onEvent: (env: EventEnvelope<EventType>) => void,
): () => void {
  const unsubscribes: Array<() => void> = [];
  for (const topic of SUBSCRIBED_TOPICS) {
    unsubscribes.push(platform.subscribe(topic, onEvent));
  }
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

const SUBSCRIBED_TOPICS = [
  "system.team.loaded",
  "system.error",
  "user.prompt",
  "agent.model.assigned",
  "agent.prompt.queue.update",
  "agent.turn.start",
  "agent.idle",
  "agent.stream.chunk",
  "agent.tool.call",
  "agent.tool.result",
  "agent.usage",
] as const;
