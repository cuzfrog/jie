import { detectCapabilities, setCapabilities, type TUI, type Terminal } from "@earendil-works/pi-tui";
import type { StopReason } from "@earendil-works/pi-ai";
import { type AnyEventEnvelope, type JiePlatform } from "../platform";
import { logger } from "../utils";
import { Actions, TuiState, type StateStore } from "./state";
import type { CommandHandler } from "./command-handler";
import type { TuiView } from "./components";
import { createTransientAger } from "./transient-ager";
import { createThinkingTicker } from "./thinking-ticker";

const SUBMIT_EDITOR_TEXT = Actions.submitEditorText("").type;
const REQUEST_INTERRUPT = Actions.requestInterrupt("", "").type;
const REQUEST_DEQUEUE = Actions.requestDequeue("", "", "").type;
const REQUEST_REQUEUE = Actions.requestRequeue("", "", "").type;
const REQUEST_QUIT = Actions.requestQuit().type;
const SAVE_KANBAN_EDIT = Actions.saveKanbanEdit("", "", "content").type;
const log = logger.getSubLogger({ name: "jie.tui" });

export type TuiStdout = NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number };

export interface TuiDeps {
  readonly platform: JiePlatform;
  readonly homeJieDir: string;
  readonly stdin?: NodeJS.ReadableStream;
  readonly stdout?: TuiStdout;
  readonly stderr?: NodeJS.WritableStream;
  readonly gitBranch?: string;
  readonly gitDirty?: boolean;
  readonly version?: string;
}

export interface CreateTUIOptions {
  readonly cwd: string;
  readonly rows?: number;
}

export interface Tui {
  start(): Promise<void>;
  stop(): void;
}

const MIN_COLS = 60;

export class TuiImpl implements Tui {
  private readonly platform: JiePlatform;
  private readonly stateStore: StateStore;
  private readonly commandHandler: CommandHandler;
  private readonly screen: TUI;
  private readonly terminal: Terminal;
  private readonly view: TuiView;
  private readonly unsubscribeBus: () => void;
  private readonly unsubscribeActions: () => void;
  private readonly unsubscribeTransientAger: () => void;
  private readonly unsubscribeThinkingTicker: () => void;
  private stopped = false;
  private resolveStart: (() => void) | null = null;
  private titleDotFrame = 0;
  private titleInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    platform: JiePlatform,
    stateStore: StateStore,
    commandHandler: CommandHandler,
    screen: TUI,
    terminal: Terminal,
    view: TuiView,
  ) {
    this.platform = platform;
    this.stateStore = stateStore;
    this.commandHandler = commandHandler;
    this.screen = screen;
    this.terminal = terminal;
    this.view = view;
    this.unsubscribeBus = subscribeToBus(platform, (env) => {
      this.stateStore.dispatch(Actions.receiveEvent(env));
      if (env.type === "agent.idle") {
        void this.maybePlaySound(env);
      }
    });
    this.unsubscribeTransientAger = createTransientAger(stateStore);
    this.unsubscribeThinkingTicker = createThinkingTicker(stateStore, () => { this.screen.requestRender(); });
    this.unsubscribeActions = stateStore.subscribe(async (action) => {
      if (action.type === SUBMIT_EDITOR_TEXT) {
        this.commandHandler.handle(action.payload.text);
        return;
      }
      if (action.type === REQUEST_INTERRUPT) {
        this.platform.interrupt(action.payload.teamId, action.payload.agentKey);
        return;
      }
      if (action.type === REQUEST_DEQUEUE) {
        this.platform.dequeuePrompt(action.payload.teamId, action.payload.agentKey, action.payload.prompt);
        return;
      }
      if (action.type === REQUEST_REQUEUE) {
        this.platform.requeuePrompt(action.payload.teamId, action.payload.agentKey, action.payload.prompt);
        return;
      }
      if (action.type === REQUEST_QUIT) {
        await this.quit();
        return;
      }
      if (action.type === SAVE_KANBAN_EDIT) {
        void this.persistKanbanEdit(action.payload.cardId, action.payload.field, action.payload.text);
        return;
      }
    });
  }

  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      const cols = this.terminal.columns;
      if (cols < MIN_COLS) {
        throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${cols}`);
      }
      this.resolveStart = (): void => {
        this.resolveStart = null;
        resolve();
      };
      try {
        setCapabilities({ ...detectCapabilities(), hyperlinks: process.env.INK_OSC8 === "1" });
        this.view.start();
        this.screen.start();
        this.startTitleAnimation();
        this.updateTitle();
      } catch (error) {
        this.resolveStart = null;
        throw error;
      }
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.titleInterval !== null) {
      clearInterval(this.titleInterval);
      this.titleInterval = null;
    }
    try {
      this.screen.stop();
    } catch {
      log.error("failed to stop tui");
    }
    this.view.stop();
    this.unsubscribeBus();
    this.unsubscribeActions();
    this.unsubscribeTransientAger();
    this.unsubscribeThinkingTicker();
    this.resolveStart?.();
  }

  private async quit(): Promise<void> {
    await this.terminal.drainInput();
    this.stop();
  }

  private persistKanbanEdit(cardId: string, field: "content" | "description", text: string): void {
    const teamId = this.stateStore.getState().teamId;
    if (teamId === null) return;
    void this.platform.execute({ name: "kanbanEdit", teamId, cardId, field, text })
      .then((result) => {
        this.stateStore.dispatch(Actions.setKanbanBoard(result.board));
      }, (error: unknown) => {
        this.stateStore.dispatch(Actions.setErrorMessage(`kanban edit failed: ${error instanceof Error ? error.message : String(error)}`));
      });
  }

  private startTitleAnimation(): void {
    this.titleInterval = setInterval(() => {
      this.titleDotFrame = (this.titleDotFrame + 1) % SPINNER.length;
      this.updateTitle();
    }, 800);
  }

  private updateTitle(): void {
    if (this.stopped) return;
    const title = buildTerminalTitle(this.stateStore.getState(), this.titleDotFrame);
    this.terminal.setTitle(title);
  }

  private async maybePlaySound(env: AnyEventEnvelope): Promise<void> {
    if (this.stopped) return;
    if (env.type !== "agent.idle" || env.sender.kind !== "agent") return;
    const state = this.stateStore.getState();
    const activeId = state.focusedAgentId ?? state.leaderAgentId;
    if (activeId === null) return;
    if (`${env.sender.teamId}:${env.sender.agentKey}` !== activeId) return;
    if (!_shouldRingOnIdle(env.payload)) return;
    try {
      const enabled = await this.platform.execute({ name: "getNotificationSoundEnabled" });
      if (enabled) this.terminal.write("\x07");
    } catch (error: unknown) {
      log.error(`failed to read notification sound setting: ${String(error)}`);
    }
  }
}

function subscribeToBus(platform: JiePlatform, onEvent: (event: AnyEventEnvelope) => void): () => void {
  const unsubscribes: Array<() => void> = [
    platform.subscribe("system.team.loaded", onEvent),
    platform.subscribe("system.error", onEvent),
    platform.subscribe("agent.model.assigned", onEvent),
    platform.subscribe("agent.prompt.queue.update", onEvent),
    platform.subscribe("agent.turn.start", onEvent),
    platform.subscribe("agent.turn.continue", onEvent),
    platform.subscribe("agent.idle", onEvent),
    platform.subscribe("agent.stream.chunk", onEvent),
    platform.subscribe("agent.stream.end", onEvent),
    platform.subscribe("agent.tool.call", onEvent),
    platform.subscribe("agent.tool.result", onEvent),
    platform.subscribe("agent.usage", onEvent),
    platform.subscribe("agent.compacted", onEvent),
    platform.subscribe("agent.compaction.start", onEvent),
    platform.subscribe("agent.compaction.end", onEvent),
  ];
  let unsubscribed = false;
  return (): void => {
    if (unsubscribed) return;
    unsubscribed = true;
    for (const unsub of unsubscribes) unsub();
  };
}

const IDLE_DOT = "●";
const SPINNER = ["◐", "◓", "◑", "◒"] as const;

function buildTerminalTitle(state: TuiState, dotFrame: number): string {
  const dot = TuiState.isBusy(state) ? SPINNER[dotFrame % SPINNER.length] : IDLE_DOT;
  const suffix = state.cwd === null ? "" : ` - ${state.cwd}`;
  return `${dot}jie${suffix}`;
}

function _shouldRingOnIdle(reason: StopReason): boolean {
  return reason === "stop" || reason === "error" || reason === "length";
}

export { buildTerminalTitle as _buildTerminalTitle };

