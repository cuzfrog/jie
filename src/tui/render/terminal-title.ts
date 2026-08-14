import type { Terminal } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";

const TITLE_FRAME_MS = 800;
const FOCUS_ENABLE = "\x1b[?1004h";
const FOCUS_DISABLE = "\x1b[?1004l";
const IDLE_DOT = "●";
const IDLE_BELL = "🔔";
const IDLE_HAND = "✋";
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
  private unsubscribe: (() => void) | null = null;

  constructor(terminal: Terminal, stateStore: StateStore, titleFrameMs: number = TITLE_FRAME_MS) {
    this.terminal = terminal;
    this.stateStore = stateStore;
    this.titleFrameMs = titleFrameMs;
  }

  initialize(): void {
    this.terminal.write(FOCUS_ENABLE);
    this.unsubscribe = this.stateStore.subscribe(async () => this.update());
    this.update();
    this.interval = setInterval(() => {
      this.titleDotFrame = (this.titleDotFrame + 1) % SPINNER.length;
      this.update();
    }, this.titleFrameMs);
  }

  dispose(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.terminal.write(FOCUS_DISABLE);
  }

  private update(): void {
    this.terminal.setTitle(buildTerminalTitle(this.stateStore.getState(), this.titleDotFrame));
  }
}

function buildTerminalTitle(state: TuiState, dotFrame: number): string {
  const icon = resolveIcon(state, dotFrame);
  const suffix = state.cwd === null ? "" : ` - ${state.cwd}`;
  return `${icon}jie${suffix}`;
}

function resolveIcon(state: TuiState, dotFrame: number): string {
  if (!state.terminalFocused && TuiState.isUserInputNeeded(state)) return IDLE_HAND;
  if (TuiState.isBusy(state)) return SPINNER[dotFrame % SPINNER.length];
  if (!state.terminalFocused && TuiState.isIdleAttentionNeeded(state)) return IDLE_BELL;
  return IDLE_DOT;
}

export { buildTerminalTitle as _buildTerminalTitle };
