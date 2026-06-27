type EventPayloadMap = {
  "agent.turn.start": null;
  "agent.idle": null;
  "agent.tool.call": { tool_call_id: string; name: string; input: string; input_truncated: boolean };
  "agent.tool.result": {
    tool_call_id: string;
    name: string;
    output: string | null;
    output_truncated: boolean;
    duration_ms: number;
    error: string | null;
  };
  "agent.stream.chunk": { stream_id: number; seq: number; block_type: "text" | "thinking"; text: string };
  "agent.stream.end": { stream_id: number; total_chunks: number };
  "agent.queue.update": { prompts: string[] };
  "team.{teamId}.agent.{agentKey}.prompt": { teamId: string; agentKey: string; prompt: string };
  "team.{teamId}.loaded": { teamId: string; agents: Array<{ role: string; agent_key: string; is_leader: boolean }> };
  "custom.{clientTopic}": { clientTopic: string; payload: unknown }
}

export interface AgentIdentity {
  teamId: string;
  agentRole: string;
  agentKey: string;
}

export type Sender =
  | { kind: "agent"; identity: AgentIdentity }
  | { kind: "cli" }
  | { kind: "tui" };

export type EventType = keyof EventPayloadMap;
export interface EventEnvelope<T extends string = string> {
  version: 1;
  topic: string;
  sender: Sender;
  timestamp: string;
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>;
}

export const Events = {
  agentTurnStart: (sender: Sender) =>
    createEvent("agent.turn.start", sender),
  agentIdle: (sender: Sender) =>
    createEvent("agent.idle", sender),
  agentToolCall: (sender: Sender, tool_call_id: string, name: string, input: string, input_truncated: boolean) =>
    createEvent("agent.tool.call", sender, { tool_call_id, name, input, input_truncated }),
  agentToolResult: (sender: Sender, tool_call_id: string, name: string, output: string | null, output_truncated: boolean, duration_ms: number, error: string | null) =>
    createEvent("agent.tool.result", sender, { tool_call_id, name, output, output_truncated, duration_ms, error }),
  agentStreamChunk: (sender: Sender, stream_id: number, seq: number, block_type: "text" | "thinking", text: string) =>
    createEvent("agent.stream.chunk", sender, { stream_id, seq, block_type, text }),
  agentStreamEnd: (sender: Sender, stream_id: number, total_chunks: number) =>
    createEvent("agent.stream.end", sender, { stream_id, total_chunks }),
  agentQueueUpdate: (sender: Sender, prompts: string[]) =>
    createEvent("agent.queue.update", sender, { prompts }),
  userPrompt: (sender: Sender, teamId: string, prompt: string, targetAgentKey: string) =>
    createEvent("team.{teamId}.agent.{agentKey}.prompt", sender, { teamId, prompt, agentKey: targetAgentKey }),
  teamLoaded: (sender: Sender, teamId: string, agents: Array<{ role: string; agent_key: string; is_leader: boolean }>) =>
    createEvent("team.{teamId}.loaded", sender, { teamId, agents }),
  custom: (sender: Sender, clientTopic: string, payload: unknown) =>
    createEvent(`custom.{clientTopic}`, sender, { clientTopic, payload }),
}

function createEvent<T extends EventType>(type: T, sender: Sender): EventEnvelope<T>;
function createEvent<T extends EventType>(type: T, sender: Sender, payload: EventPayloadMap[T]): EventEnvelope<T>;
function createEvent(type: EventType, sender: Sender, payload?: EventPayloadMap[EventType]): EventEnvelope<EventType> {
  return Object.freeze({ version: 1, sender, topic: resolveTopic(type, payload), timestamp: new Date().toISOString(), payload: payload ?? null });
}

const PLACEHOLDER_PATTERN = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
function resolveTopic(template: string, payload: EventPayloadMap[EventType] | null | undefined): string {
  return template.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) => {
    if (payload !== null && payload !== undefined && typeof payload === "object") {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string") return value;
    }
    throw new Error(`Cannot resolve topic placeholder ${placeholder}: missing ${key} in payload`);
  });
}

