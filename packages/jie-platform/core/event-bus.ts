import { InProcessEventBus } from "./in-process-event-bus";

export type EventCallback = (subject: string, payload: object) => void;

export interface EventBus {

  publish(subject: string, payload: object): void;

  subscribe(subject: string, callback: EventCallback): () => void;

  subscriberCount(subject: string): number;
}

export function createEventBus(): EventBus {
  return new InProcessEventBus();
}
