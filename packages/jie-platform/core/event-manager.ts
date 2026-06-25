import type { EventBus } from "./event-bus.ts";
import { createEventBus } from "./event-bus.ts";
import type { EventEnvelope } from "./types.ts";



export interface EventManager {
  publish<T extends string>(event: EventEnvelope<T>): void;
  /** returns an unsubscribe function */
  subscribe<T extends string>(subject: T, callback: (event: EventEnvelope<T>) => void): () => void;
  subscriberCount(subject: string): number;
}

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";

export function createEventManager(bus: EventBus = createEventBus()): EventManager {
  return {
    publish<T extends string>(event: EventEnvelope<T>): void {
      const shaped = shapeEnvelope(event);
      bus.publish(shaped.type, shaped);
    },
    subscribe<T extends string>(subject: T, callback: (event: EventEnvelope<T>) => void): () => void {
      return bus.subscribe(subject, (_subject, env) => {
        callback(env as EventEnvelope<T>);
      });
    },
    subscriberCount(subject: string): number {
      return bus.subscriberCount(subject);
    },
  };
}

function shapeEnvelope<T extends string>(event: EventEnvelope<T>): EventEnvelope<T> {
  if (event.type === "agent.tool.call") {
    return { ...event, payload: shapeToolCall(event.payload as { tool_call_id: string; name: string; input: string; input_truncated: boolean }) } as EventEnvelope<T>;
  }
  if (event.type === "agent.tool.result") {
    return { ...event, payload: shapeToolResult(event.payload as { tool_call_id: string; name: string; output: string | null; output_truncated: boolean; duration_ms: number; error: string | null }) } as EventEnvelope<T>;
  }
  return event;
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
