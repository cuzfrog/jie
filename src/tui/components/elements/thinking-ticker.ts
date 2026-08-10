import { TuiState, type StateStore } from "../../state";
import type { TuiComponent } from "../..";

const THINKING_TICK_MS = 200;

export interface ThinkingTicker extends TuiComponent {
  stop(): void;
}

export class ThinkingTickerImpl implements ThinkingTicker {
  private readonly stateStore: StateStore;
  private readonly requestRender: () => void;
  private readonly tickMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private thinking = false;

  constructor(stateStore: StateStore, requestRender: () => void, tickMs: number = THINKING_TICK_MS) {
    this.stateStore = stateStore;
    this.requestRender = requestRender;
    this.tickMs = tickMs;
  }

  update(): boolean {
    const thinking = TuiState.anyAgentThinking(this.stateStore.getState());
    if (thinking === this.thinking) return false;
    this.thinking = thinking;
    if (thinking && this.timer === null) {
      this.timer = setInterval(() => this.requestRender(), this.tickMs);
    } else if (!thinking && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return false;
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {}

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
