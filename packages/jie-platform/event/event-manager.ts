import type { EventBus } from "./event-bus";
import { createEventBus } from "./event-bus";
import type { EventEnvelope, EventType } from "./events";
import { logger } from "../utils";

const log = logger.getSubLogger({ name: "jie.platform.event" });

export interface EventManager {
  publish<T extends EventType>(event: EventEnvelope<T>): void;
  /** returns an unsubscribe function */
  subscribe<T extends EventType>(eventType: T, callback: (event: EventEnvelope<T>) => void): () => void;
  subscribe(eventType: string, callback: (event: EventEnvelope<EventType>) => void): () => void;
  subscriberCount(subject: string): number;
}

export function createEventManager(bus: EventBus = createEventBus()): EventManager {
  return {
    publish<T extends EventType>(event: EventEnvelope<T>): void {
      log.trace("publish", event);
      bus.publish(event.topic, event);
    },
    subscribe(eventType: string, callback: (event: EventEnvelope<EventType>) => void): () => void {
      return bus.subscribe(eventType, (_subject, env) => {
        callback(env as EventEnvelope<EventType>);
      });
    },
    subscriberCount(subject: string): number {
      return bus.subscriberCount(subject);
    },
  };
}
