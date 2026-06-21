import type { EventBus } from "./event-bus.ts";
import type { EventEnvelope, EventPayloadMap, Sender } from "./types.ts";



export interface EventManager {
  publish<T extends string>(subject: T, payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>, sender: Sender): void;
  subscribe<T extends string>(subject: T, callback: (event: EventEnvelope<T>) => void): () => void;
  subscriberCount(subject: string): number;
}

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";

export function createEventManager(bus: EventBus): EventManager {
  return {
    publish<T extends string>(subject: T, payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>, sender: Sender): void {
      let shaped: unknown = payload;
      if (subject === "agent.tool.call") shaped = shapeToolCall(payload as EventPayloadMap["agent.tool.call"]);
      else if (subject === "agent.tool.result") shaped = shapeToolResult(payload as EventPayloadMap["agent.tool.result"]);
      bus.publish(subject, buildEnvelope(subject, shaped, sender));
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

function buildEnvelope(topic: string, payload: unknown, sender: Sender): {
  version: 1;
  event_type: string;
  sender: Sender;
  timestamp: string;
  payload: unknown;
} {
  return {
    version: 1 as const,
    event_type: topic,
    sender,
    timestamp: new Date().toISOString(),
    payload,
  };
}

function shapeToolCall(payload: EventPayloadMap["agent.tool.call"]): EventPayloadMap["agent.tool.call"] {
  if (!payload.input_truncated && payload.input.length > TRUNCATION_BYTES) {
    const { text, truncated } = truncateForTelemetry(payload.input);
    return { tool_call_id: payload.tool_call_id, name: payload.name, input: text, input_truncated: truncated };
  }
  return payload;
}

function shapeToolResult(payload: EventPayloadMap["agent.tool.result"]): EventPayloadMap["agent.tool.result"] {
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