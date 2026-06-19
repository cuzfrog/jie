import { InProcessEventBus } from "./in-process-event-bus";

/** A callback registered against a subject. Receives the subject the
 *  event was published on and the payload (the AgentEvent envelope, in
 *  the platform's wire contract). */
export type EventCallback = (subject: string, payload: object) => void;

/** Pub/sub backbone. v1 ships `InProcessEventBus` (synchronous, in-process
 *  dispatch). A future `NatsEventBus` implements the same interface over
 *  NATS core pub/sub. The interface is transport-agnostic: publishers
 *  and subscribers only see this shape. */
export interface EventBus {
  /** Fire-and-forget. Synchronous callback dispatch in-process; async
   *  flush in NATS mode. */
  publish(subject: string, payload: object): void;

  /** Register a callback. Returns an unsubscribe function. Callbacks
   *  fire in subscription order within a subject. */
  subscribe(subject: string, callback: EventCallback): () => void;

  /** Number of active callbacks subscribed to a subject. Unaffected by
   *  callback errors. */
  subscriberCount(subject: string): number;
}

export function createEventBus(): EventBus {
  return new InProcessEventBus();
}
