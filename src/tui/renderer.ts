import type { StateStore } from "./state";
import type { TuiRoot } from "./tui-component";

export interface TuiRenderer {
  start(): void;
  stop(): void;
}

export class TuiRendererImpl implements TuiRenderer {
  private readonly stateStore: StateStore;
  private readonly requestRender: () => void;
  private readonly view: TuiRoot;
  private unsubscribe: (() => void) | null = null;

  constructor(stateStore: StateStore, requestRender: () => void, view: TuiRoot) {
    this.stateStore = stateStore;
    this.requestRender = requestRender;
    this.view = view;
  }

  start(): void {
    this.unsubscribe = this.stateStore.subscribe(async (): Promise<void> => {
      if (this.view.update()) this.requestRender();
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
