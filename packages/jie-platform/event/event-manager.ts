import type { EventBus } from "./event-bus";
import { createEventBus } from "./event-bus";
import type { EventEnvelope, EventType } from "./events";

export interface EventManager {
  publish<T extends EventType>(event: EventEnvelope<T>): void;
  /** returns an unsubscribe function */
  subscribe<T extends EventType>(subject: T, callback: (event: EventEnvelope<T>) => void): () => void;
  subscriberCount(subject: string): number;
}

export function createEventManager(bus: EventBus = createEventBus()): EventManager {
  return {
    publish<T extends EventType>(event: EventEnvelope<T>): void {
      bus.publish(event.topic, event);
    },
    subscribe<T extends EventType>(subject: T, callback: (event: EventEnvelope<T>) => void): () => void {
      return bus.subscribe(subject, (_subject, env) => {
        callback(env as EventEnvelope<T>);
      });
    },
    subscriberCount(subject: string): number {
      return bus.subscriberCount(subject);
    },
  };
}
