import { Actions, TuiState, type StateStore } from "../state";
import type { TuiRoot } from "../types";
import type { TerminalTitle } from "./terminal-title";

const RENDER_TICK_MS = 80;
const TRANSIENT_TTL_MS = 5000;

export interface TuiRenderer {
  start(): void;
  stop(): void;
}

export class TuiRendererImpl implements TuiRenderer {
  private readonly stateStore: StateStore;
  private readonly requestRender: () => void;
  private readonly view: TuiRoot;
  private readonly terminalTitle: TerminalTitle;
  private readonly renderTickMs: number;
  private readonly transientTtlMs: number;
  private unsubscribe: (() => void) | null = null;
  private renderInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    stateStore: StateStore,
    requestRender: () => void,
    view: TuiRoot,
    terminalTitle: TerminalTitle,
    renderTickMs: number = RENDER_TICK_MS,
    transientTtlMs: number = TRANSIENT_TTL_MS,
  ) {
    this.stateStore = stateStore;
    this.requestRender = requestRender;
    this.view = view;
    this.terminalTitle = terminalTitle;
    this.renderTickMs = renderTickMs;
    this.transientTtlMs = transientTtlMs;
  }

  start(): void {
    this.unsubscribe = this.stateStore.subscribe(async (): Promise<void> => {
      if (this.view.update()) this.requestRender();
    });
    this.renderInterval = setInterval(() => this.tick(), this.renderTickMs);
    this.terminalTitle.start();
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.renderInterval !== null) {
      clearInterval(this.renderInterval);
      this.renderInterval = null;
    }
    this.terminalTitle.stop();
  }

  private tick(): void {
    const state = this.stateStore.getState();
    if (state.transientSetAt !== null && Date.now() - state.transientSetAt >= this.transientTtlMs) {
      this.stateStore.dispatch(Actions.clearTransientMessage());
    }
    if (TuiState.isBusy(state) || TuiState.anyAgentThinking(state)) this.requestRender();
  }
}
