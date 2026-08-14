import type { Terminal } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";

const TITLE_FRAME_MS = 800;
const IDLE_DOT = "●";
const IDLE_BELL = "🔔";
const SPINNER = ["◐", "◓", "◑", "◒"] as const;

export interface TerminalTitle {
  initialize(): void;
  dispose(): void;
}

export class TerminalTitleImpl implements TerminalTitle {
  private readonly terminal: Terminal;
  private readonly stateStore: StateStore;
  private readonly titleFrameMs: number;
  private titleDotFrame = 0;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(terminal: Terminal, stateStore: StateStore, titleFrameMs: number = TITLE_FRAME_MS) {
    this.terminal = terminal;
    this.stateStore = stateStore;
    this.titleFrameMs = titleFrameMs;
  }

  initialize(): void {
    this.update();
    this.interval = setInterval(() => {
      this.titleDotFrame = (this.titleDotFrame + 1) % SPINNER.length;
      this.update();
    }, this.titleFrameMs);
  }

  dispose(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  private update(): void {
    this.terminal.setTitle(buildTerminalTitle(this.stateStore.getState(), this.titleDotFrame));
  }
}

function buildTerminalTitle(state: TuiState, dotFrame: number): string {
  const icon = TuiState.isIdleAttentionNeeded(state) ? IDLE_BELL : TuiState.isBusy(state) ? SPINNER[dotFrame % SPINNER.length] : IDLE_DOT;
  const suffix = state.cwd === null ? "" : ` - ${state.cwd}`;
  return `${icon}jie${suffix}`;
}

export { buildTerminalTitle as _buildTerminalTitle };
