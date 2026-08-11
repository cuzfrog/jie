export interface ShutdownSignal {
  readonly stopped: Promise<void>;
  request(): void;
}

export class ShutdownSignalImpl implements ShutdownSignal {
  private resolve: (() => void) | null = null;
  readonly stopped: Promise<void>;

  constructor() {
    this.stopped = new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  request(): void {
    this.resolve?.();
    this.resolve = null;
  }
}
