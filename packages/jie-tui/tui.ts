import type { WriteStream, ReadStream } from "node:tty";
import { render } from "ink";
import type { AnyEventEnvelope, EventEnvelope, EventType, JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, type TuiState, type StateStore, createStateStore } from "./state";
import { createTuiCommandHandler, type TuiCommandHandler } from "./command-handler";
import { App } from "./components/app/app";

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
  readonly state: TuiState;
  submit(text: string): void;
  start(): Promise<void>;
  stop(): void;
}

const MIN_COLS = 60;
const ALT_SCREEN_ON = "\x1b[?1049h";
const ALT_SCREEN_OFF = "\x1b[?1049l";

export function createTui(options: CreateTUIOptions, deps: TuiDeps): Tui {
  if (process.stdin.isTTY !== true && deps.stdin === undefined) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }
  const stateStore = createStateStore();
  const commandHandler = createTuiCommandHandler({ stateStore, platform: deps.platform });
  const tui = new InkTui(options, deps, stateStore, commandHandler);
  (tui as unknown as { stateStore: StateStore }).stateStore = stateStore;
  return tui;
}

class InkTui implements Tui {
  private readonly options: CreateTUIOptions;
  private readonly deps: TuiDeps;
  readonly stateStore: StateStore;
  private readonly commandHandler: TuiCommandHandler;
  private readonly unsubscribeBus: () => void;
  private inkInstance: ReturnType<typeof render> | null = null;
  private resolveStart: (() => void) | null = null;
  private started = false;

  constructor(
    options: CreateTUIOptions,
    deps: TuiDeps,
    stateStore: StateStore,
    commandHandler: TuiCommandHandler,
  ) {
    this.options = options;
    this.deps = deps;
    this.stateStore = stateStore;
    this.commandHandler = commandHandler;
    this.unsubscribeBus = subscribeToBus(this.deps.platform, (env) => {
      this.stateStore.dispatch(Actions.receiveEvent(env as AnyEventEnvelope));
    });
  }

  get state(): TuiState {
    return this.stateStore.getState();
  }

  submit(text: string): void {
    this.stateStore.dispatch(Actions.clearBanners());
    const trimmed = text.trim();
    if (trimmed.startsWith("/")) {
      this.commandHandler.handle(trimmed);
      return;
    }
    this.publishPrompt(trimmed);
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
        stdout.write(ALT_SCREEN_ON);
        const stdin = this.deps.stdin ?? process.stdin;
        const stderr = this.deps.stderr;
        const instance = render(
          App({
            tui: this as unknown as Tui,
            platform: this.deps.platform,
            cwd: this.options.cwd,
            gitBranch: this.deps.gitBranch ?? "",
            gitDirty: this.deps.gitDirty ?? false,
          }),
          { stdout, stdin, stderr, exitOnCtrlC: false, patchConsole: true },
        );
        this.inkInstance = instance;
        this.started = true;
        void instance.waitUntilExit().then(() => this.resolveStart?.());
      } catch (error) {
        this.resolveStart = null;
        throw error;
      }
    });
  }

  stop(): void {
    if (this.started && this.inkInstance !== null) {
      try {
        this.inkInstance.unmount();
      } catch {
        // ignore
      }
      this.inkInstance = null;
      this.started = false;
    }
    this.unsubscribeBus();
    this.resolveStart?.();
    const stdout = this.deps.stdout ?? process.stdout;
    stdout.write(ALT_SCREEN_OFF);
  }

  private publishPrompt(text: string): void {
    const state = this.stateStore.getState();
    if (state.focusedAgentId === null) return;
    const target = state.agents.get(state.focusedAgentId);
    if (target === undefined) return;
    this.deps.platform.prompt(target.teamId, target.agentKey, text);
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
  "agent.interrupt",
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