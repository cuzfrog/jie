type EventCallback = (subject: string, payload: object) => void;

/** Low level primitive behind `EventManager`. */
export interface EventBus {

  readonly publish: (subject: string, payload: object) => void;

  /** returns an unsubscribe function */
  readonly subscribe: (subject: string, callback: EventCallback) => () => void;

  readonly subscriberCount: (subject: string) => number;
}

export function createEventBus(): EventBus {
  return new InProcessEventBus();
}

class InProcessEventBus implements EventBus {
  private readonly subscribers = new Map<string, Set<EventCallback>>();

  publish(subject: string, payload: object): void {
    const callbacks = this.subscribers.get(subject);
    if (!callbacks) return;
    for (const callback of callbacks) {
      try {
        callback(subject, payload);
      } catch (error) {
        this.reportError(subject, error);
      }
    }
  }

  subscribe(subject: string, callback: EventCallback): () => void {
    let callbacks = this.subscribers.get(subject);
    if (!callbacks) {
      callbacks = new Set();
      this.subscribers.set(subject, callbacks);
    }
    callbacks.add(callback);
    return () => {
      this.subscribers.get(subject)?.delete(callback);
    };
  }

  subscriberCount(subject: string): number {
    return this.subscribers.get(subject)?.size ?? 0;
  }

  private reportError(subject: string, error: unknown): void {
    if (error instanceof Error) {
      console.error(
        `EventBus callback error on subject "${subject}": ${error.message}`,
        error.stack,
      );
      return;
    }
    console.error(`EventBus callback error on subject "${subject}":`, error);
  }
}
