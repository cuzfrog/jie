import type { EventBus } from "./event-bus";

export interface AgentEvent<T extends string = string> {
  version: 1;
  team_id: string;
  event_type: T;
  agent_role?: string;
  agent_key?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AgentEventPayloadMap {
  "agent.turn.start": Record<string, never>;
  "agent.idle": Record<string, never>;
  "agent.tool.call": { tool_call_id: string; name: string; input: unknown };
  "agent.tool.result": {
    tool_call_id: string;
    name: string;
    output: unknown;
    durationMs: number;
    error: string | null;
  };
  "agent.stream.chunk": { stream_id: number; seq: number; block_type: "text" | "thinking"; text: string };
  "agent.stream.end": { stream_id: number; total_chunks: number };
  "agent.queue.update": { prompts: string[] };
}
export type AgentEventPayload<T extends keyof AgentEventPayloadMap> = AgentEventPayloadMap[T];

export interface AgentEventPublisher {
  publish<T extends keyof AgentEventPayloadMap>(topic: T, payload: AgentEventPayloadMap[T]): void;
}

export function makeAgentEventPublisher(
  bus: EventBus,
  identity: { agentKey: string; agentRole: string; teamId: string },
): AgentEventPublisher {
  function buildToolCallPayload(p: { tool_call_id: string; name: string; input: unknown }): Record<string, unknown> {
    const { text, truncated } = truncateForTelemetry(jsonStringify(p.input));
    return { tool_call_id: p.tool_call_id, name: p.name, input: text, input_truncated: truncated };
  }

  function buildToolResultPayload(p: {
    tool_call_id: string;
    name: string;
    output: unknown;
    durationMs: number;
    error: string | null;
  }): Record<string, unknown> {
    const { text, truncated } = truncateForTelemetry(jsonStringify(p.output));
    return {
      tool_call_id: p.tool_call_id,
      name: p.name,
      output: p.error === null ? text : null,
      output_truncated: p.error === null ? truncated : false,
      duration_ms: p.durationMs,
      error: p.error,
    };
  }

  return {
    publish(topic: string, payload: Record<string, unknown>): void {
      let eventPayload: Record<string, unknown>;
      switch (topic) {
        case "agent.tool.call":
          eventPayload = buildToolCallPayload(payload as { tool_call_id: string; name: string; input: unknown });
          break;
        case "agent.tool.result":
          eventPayload = buildToolResultPayload(payload as {
            tool_call_id: string;
            name: string;
            output: unknown;
            durationMs: number;
            error: string | null;
          });
          break;
        default:
          eventPayload = payload;
      }
      const envelope: AgentEvent = {
        version: 1,
        team_id: identity.teamId,
        event_type: topic,
        agent_role: identity.agentRole,
        agent_key: identity.agentKey,
        timestamp: new Date().toISOString(),
        payload: eventPayload,
      };
      bus.publish(topic, envelope);
    },
  };
}

const TRUNCATION_KB = 4;
const TRUNCATION_BYTES = TRUNCATION_KB * 1024;
const MARKER_FORMAT = "...[%d chars truncated]...";

function truncateForTelemetry(input: string): { text: string; truncated: boolean } {
  if (input.length <= TRUNCATION_BYTES) return { text: input, truncated: false };
  const half = Math.floor((TRUNCATION_BYTES - 25) / 2);
  const truncatedChars = input.length - half * 2;
  return {
    text: `${input.slice(0, half)}${MARKER_FORMAT.replace("%d", String(truncatedChars))}${input.slice(input.length - half)}`,
    truncated: true,
  };
}

function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v));
}
