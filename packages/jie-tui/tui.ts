import { ProcessTerminal, TUI, type Terminal } from "@earendil-works/pi-tui";
import type { AnyEventEnvelope, EventEnvelope, EventType, JiePlatform } from "@cuzfrog/jie-platform";
import { type TuiState, Actions, createStateStore, type StateStore } from "./state";
import { createTuiCommandHandler, type TuiCommandHandler } from "./command-handler";
import { createKeyboardHandler, type KeyboardHandler } from "./keyboard-handler";
import { buildView, type BuildViewResult } from "./components";

export interface TuiDeps {
  readonly platform: JiePlatform;
}

export interface CreateTUIOptions {
  readonly cwd: string;
  readonly rows?: number;
  readonly terminal?: Terminal;
}

export interface Tui {
  getState(): TuiState;
  submit(text: string): void;
  start(): Promise<void>;
  stop(): void;
}

const MIN_COLS = 60;

export function createTui(deps: TuiDeps, options: CreateTUIOptions): Tui {
  if (process.stdin.isTTY !== true) {
    throw new Error("TUI requires an interactive terminal; use `jie -p` for scripts.");
  }
  if (!isUtf8()) {
    throw new Error("TUI requires a UTF-8 locale; set LANG=en_US.UTF-8");
  }
  const terminal = options.terminal ?? new ProcessTerminal();
  const tui = new TUI(terminal);
  const stateStore = createStateStore();
  const view = buildView(stateStore, { cwd: options.cwd }, tui);
  tui.addChild(view.root);
  const commandHandler = createTuiCommandHandler({
    stateStore,
    platform: deps.platform,
  });
  const keyboardHandler = createKeyboardHandler({
    platform: deps.platform,
    stateStore,
  });
  const piTui = new PiTui({
    terminal,
    tui,
    view,
    cwd: options.cwd,
    stateStore,
    platform: deps.platform,
    commandHandler,
    keyboardHandler,
  });
  return piTui;
}

interface PiTuiCtorOptions {
  readonly terminal: Terminal;
  readonly tui: TUI;
  readonly view: BuildViewResult;
  readonly cwd: string;
  readonly stateStore: StateStore;
  readonly platform: JiePlatform;
  readonly commandHandler: TuiCommandHandler;
  readonly keyboardHandler: KeyboardHandler;
}

class PiTui implements Tui {
  private readonly stateStore: StateStore;
  private readonly terminal: Terminal;
  private readonly tui: TUI;
  private readonly view: BuildViewResult;
  private readonly cwd: string;
  private readonly platform: JiePlatform;
  private readonly commandHandler: TuiCommandHandler;
  private readonly keyboardHandler: KeyboardHandler;
  private readonly unsubscribeBus: () => void;
  private readonly unsubscribeRender: () => void;
  private resolveStart: (() => void) | null = null;

  constructor(opts: PiTuiCtorOptions) {
    this.stateStore = opts.stateStore;
    this.terminal = opts.terminal;
    this.tui = opts.tui;
    this.view = opts.view;
    this.cwd = opts.cwd;
    this.platform = opts.platform;
    this.commandHandler = opts.commandHandler;
    this.keyboardHandler = opts.keyboardHandler;
    this.unsubscribeBus = subscribeToBus(this.platform, (env) => this.stateStore.dispatch(Actions.receiveEvent(env as AnyEventEnvelope)));
    this.unsubscribeRender = this.stateStore.subscribe(() => this.onStateChange());
  }

  getState(): TuiState {
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
    this.unsubscribeBus();
    this.unsubscribeRender();
    this.resolveStart?.();
    this.tui.stop();
  }

  private onStateChange(): void {
    if (this.stateStore.getState().pendingQuit) {
      this.stop();
      return;
    }
    void this.render();
  }

  private async render(): Promise<void> {
    const state = this.stateStore.getState();
    const focused = this.stateStore.getFocusedAgent();
    this.view.chatPane.setAgent(focused);
    this.view.editor.setQueueIndicator(formatQueueIndicator(focused?.queue ?? null));
    this.view.rail.setItemsFromState(state);
    const git = await this.platform.execute({ name: "getGitStatus" });
    this.view.statusBar.update({ cwd: this.cwd, git }, this.stateStore);
    this.tui.requestRender();
  }

  private publishPrompt(text: string): void {
    const state = this.stateStore.getState();
    if (state.teamId === null || state.focusedAgentId === null) {
      this.stateStore.dispatch(Actions.setErrorMessage("No team loaded; run `/team <id>` to load a team."));
      return;
    }
    const target = this.stateStore.getFocusedAgent();
    if (target === null) {
      this.stateStore.dispatch(Actions.setErrorMessage("Team has no agent to address; load a valid team with `/team <id>`."));
      return;
    }
    this.platform.prompt(state.teamId, target.agentKey, text);
  }

}

function subscribeToBus(platform: JiePlatform, onEvent: (env: EventEnvelope<EventType>) => void): () => void {
  const busUnsubscribes: Array<() => void> = [];
  for (const topic of SUBSCRIBED_TOPICS) {
    busUnsubscribes.push(platform.subscribe(topic, onEvent));
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

const SUBSCRIBED_TOPICS = [
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
] as const;

const QUEUE_PREVIEW_MAX_CHARS = 100;

function formatQueueIndicator(queue: ReadonlyArray<string> | null): string | null {
  if (queue === null || queue.length === 0) return null;
  const next = queue[0] ?? "";
  const preview = next.length > QUEUE_PREVIEW_MAX_CHARS ? `${next.slice(0, QUEUE_PREVIEW_MAX_CHARS)}…` : next;
  const suffix = queue.length === 1 ? "prompt" : "prompts";
  return `${queue.length} ${suffix} queued  > ${preview}`;
}