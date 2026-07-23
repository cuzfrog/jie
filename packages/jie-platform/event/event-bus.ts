import { logger } from "@cuzfrog/jie-utils";

type EventCallback = (subject: string, payload: object) => void;

const log = logger.getSubLogger({ name: "jie.platform.event" });

/** Low level primitive behind `EventManager`. */
export interface EventBus {

  publish(subject: string, payload: object): void;

  /** returns an unsubscribe function */
  subscribe(subject: string, callback: EventCallback): () => void;
}

export class InProcessEventBus implements EventBus {
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

  private reportError(subject: string, error: unknown): void {
    if (error instanceof Error) {
      log.error(`EventBus callback error on subject "${subject}": ${error.message}`, { stack: error.stack });
      return;
    }
    log.error(`EventBus callback error on subject "${subject}"`, { error });
  }
}
