import type { EventBus } from "./event-bus.ts";
import type { AgentEvent } from "./agent-event.ts";

const STREAM_CHUNK_SIZE = 64;
const STREAM_FLUSH_MS = 200;
const TRUNCATION_KB = 4;
const TRUNCATION_BYTES = TRUNCATION_KB * 1024;
const MARKER_FORMAT = "...[%d chars truncated]...";

export type BlockType = "text" | "thinking";

export function truncateForTelemetry(input: string): {
  text: string;
  truncated: boolean;
} {
  if (input.length <= TRUNCATION_BYTES) {
    return { text: input, truncated: false };
  }
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

export function makeStreamPublisher(bus: EventBus, agentKey: string, agentRole: string, teamId: string) {
  let streamId = 0;
  let buffer = "";
  let blockType: BlockType | null = null;
  let seq = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let totalChunks = 0;

  function publish(topic: string, payload: Record<string, unknown>): void {
    const envelope: AgentEvent = {
      version: 1,
      team_id: teamId,
      event_type: topic,
      agent_role: agentRole,
      agent_key: agentKey,
      timestamp: new Date().toISOString(),
      payload,
    };
    bus.publish(topic, envelope);
  }

  function flush(): void {
    if (buffer.length === 0 || blockType === null) {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      return;
    }
    publish("agent.stream.chunk", {
      stream_id: streamId,
      seq: seq,
      block_type: blockType,
      text: buffer,
    });
    seq += 1;
    totalChunks += 1;
    buffer = "";
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {

    beginStream(): void {
      streamId += 1;
      seq = 0;
      totalChunks = 0;
      buffer = "";
      blockType = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },

    append(blockTypeValue: BlockType, delta: string): void {
      if (blockType !== null && blockType !== blockTypeValue) {
        flush();
      }
      blockType = blockTypeValue;
      buffer += delta;
      if (buffer.length >= STREAM_CHUNK_SIZE) {
        flush();
        return;
      }
      if (timer === null) {
        timer = setTimeout(() => flush(), STREAM_FLUSH_MS);
      }
    },

    endStream(): { stream_id: number; total_chunks: number } {
      flush();
      const out = { stream_id: streamId, total_chunks: totalChunks };
      publish("agent.stream.end", out);
      return out;
    },
  };
}

export function publishToolCallEvent(
  bus: EventBus,
  agentKey: string,
  agentRole: string,
  teamId: string,
  toolCallId: string,
  name: string,
  input: unknown,
): void {
  const serialized = jsonStringify(input);
  const { text, truncated } = truncateForTelemetry(serialized);
  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: "agent.tool.call",
    agent_role: agentRole,
    agent_key: agentKey,
    timestamp: new Date().toISOString(),
    payload: {
      tool_call_id: toolCallId,
      name,
      input: text,
      input_truncated: truncated,
    },
  };
  bus.publish("agent.tool.call", envelope);
}

export function publishToolResultEvent(
  bus: EventBus,
  agentKey: string,
  agentRole: string,
  teamId: string,
  toolCallId: string,
  name: string,
  output: unknown,
  durationMs: number,
  error: string | null,
): void {
  const serialized = jsonStringify(output);
  const { text, truncated } = truncateForTelemetry(serialized);
  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: "agent.tool.result",
    agent_role: agentRole,
    agent_key: agentKey,
    timestamp: new Date().toISOString(),
    payload: {
      tool_call_id: toolCallId,
      name,
      output: text,
      output_truncated: truncated,
      duration_ms: durationMs,
      error,
    },
  };
  bus.publish("agent.tool.result", envelope);
}

export function publishPlatformEvent(
  bus: EventBus,
  topic: string,
  agentKey: string,
  agentRole: string,
  teamId: string,
  payload: Record<string, unknown> = {},
): void {
  const envelope: AgentEvent = {
    version: 1,
    team_id: teamId,
    event_type: topic,
    agent_role: agentRole,
    agent_key: agentKey,
    timestamp: new Date().toISOString(),
    payload,
  };
  bus.publish(topic, envelope);
}