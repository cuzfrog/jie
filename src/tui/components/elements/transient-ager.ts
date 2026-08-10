import { Actions, type StateStore } from "../../state";
import type { TuiComponent } from "../..";

const TRANSIENT_TTL_MS = 5000;

export interface TransientAger extends TuiComponent {
  stop(): void;
}

export class TransientAgerImpl implements TransientAger {
  private readonly stateStore: StateStore;
  private readonly ttlMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private transientMessage: string | null = null;

  constructor(stateStore: StateStore, ttlMs: number = TRANSIENT_TTL_MS) {
    this.stateStore = stateStore;
    this.ttlMs = ttlMs;
  }

  update(): boolean {
    const transient = this.stateStore.getState().transientMessage;
    if (transient === this.transientMessage) return false;
    this.transientMessage = transient;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = transient === null ? null : setTimeout(() => {
      this.timer = null;
      this.stateStore.dispatch(Actions.clearTransientMessage());
    }, this.ttlMs);
    return false;
  }

  render(_width: number): string[] {
    return [];
  }

  invalidate(): void {}

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
