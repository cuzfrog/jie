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
      const shaped = shapeEnvelope(event);
      bus.publish(shaped.topic, shaped);
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

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";

const SHAPERS: Record<string, (payload: unknown) => unknown> = {
  "agent.tool.call": (payload) => shapeToolCall(payload as { tool_call_id: string; name: string; input: string; input_truncated: boolean }),
  "agent.tool.result": (payload) => shapeToolResult(payload as { tool_call_id: string; name: string; output: string | null; output_truncated: boolean; duration_ms: number; error: string | null }),
};

function shapeEnvelope<T extends EventType>(event: EventEnvelope<T>): EventEnvelope<T> {
  const shaper = SHAPERS[event.topic];
  if (shaper === undefined) return event;
  return { ...event, payload: shaper(event.payload) } as EventEnvelope<T>;
}

function shapeToolCall(payload: { tool_call_id: string; name: string; input: string; input_truncated: boolean }): { tool_call_id: string; name: string; input: string; input_truncated: boolean } {
  if (!payload.input_truncated && payload.input.length > TRUNCATION_BYTES) {
    const { text, truncated } = truncateForTelemetry(payload.input);
    return { tool_call_id: payload.tool_call_id, name: payload.name, input: text, input_truncated: truncated };
  }
  return payload;
}

function shapeToolResult(payload: { tool_call_id: string; name: string; output: string | null; output_truncated: boolean; duration_ms: number; error: string | null }): { tool_call_id: string; name: string; output: string | null; output_truncated: boolean; duration_ms: number; error: string | null } {
  if (payload.output === null || payload.output_truncated) return payload;
  if (payload.output.length > TRUNCATION_BYTES) {
    const { text, truncated } = truncateForTelemetry(payload.output);
    return {
      tool_call_id: payload.tool_call_id,
      name: payload.name,
      output: text,
      output_truncated: truncated,
      duration_ms: payload.duration_ms,
      error: payload.error,
    };
  }
  return payload;
}

function truncateForTelemetry(input: string): { text: string; truncated: boolean } {
  if (input.length <= TRUNCATION_BYTES) return { text: input, truncated: false };
  const half = Math.floor((TRUNCATION_BYTES - 25) / 2);
  const truncatedChars = input.length - half * 2;
  return {
    text: `${input.slice(0, half)}${TRUNCATION_MARKER.replace("%d", String(truncatedChars))}${input.slice(input.length - half)}`,
    truncated: true,
  };
}