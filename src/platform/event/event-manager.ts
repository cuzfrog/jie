import type { EventEnvelope, EventType } from "./events";
import { logger } from "../../utils";

const log = logger.getSubLogger({ name: "jie.platform.event" });

type EventCallback = (event: EventEnvelope<EventType>) => void;

export interface EventManager {
  publish<T extends EventType>(event: EventEnvelope<T>): void;
  /** returns an unsubscribe function */
  subscribe<T extends EventType>(eventType: T, callback: (event: EventEnvelope<T>) => void): () => void;
  subscribe(eventType: string, callback: (event: EventEnvelope<EventType>) => void): () => void;
}

export class InProcessEventManager implements EventManager {
  private readonly subscribers = new Map<string, Set<EventCallback>>();

  publish<T extends EventType>(event: EventEnvelope<T>): void {
    log.trace("publish", event);
    const callbacks = this.subscribers.get(event.topic);
    if (!callbacks) return;
    for (const callback of callbacks) {
      try {
        callback(event);
      } catch (error) {
        this.reportError(event.topic, error);
      }
    }
  }

  subscribe<T extends EventType>(eventType: T, callback: (event: EventEnvelope<T>) => void): () => void;
  subscribe(eventType: string, callback: (event: EventEnvelope<EventType>) => void): () => void;
  subscribe(eventType: string, callback: (event: EventEnvelope<EventType>) => void): () => void {
    let callbacks = this.subscribers.get(eventType);
    if (!callbacks) {
      callbacks = new Set();
      this.subscribers.set(eventType, callbacks);
    }
    callbacks.add(callback as EventCallback);
    return () => {
      this.subscribers.get(eventType)?.delete(callback as EventCallback);
    };
  }

  private reportError(topic: string, error: unknown): void {
    if (error instanceof Error) {
      log.error(`EventManager callback error on topic "${topic}": ${error.message}`, { stack: error.stack });
      return;
    }
    log.error(`EventManager callback error on topic "${topic}"`, { error });
  }
}
