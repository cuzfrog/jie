export const EventTypes = {
  AGENT_TURN_START: "agent.turn.start",
  AGENT_IDLE: "agent.idle",
  AGENT_TOOL_CALL: "agent.tool.call",
  AGENT_TOOL_RESULT: "agent.tool.result",
  AGENT_STREAM_CHUNK: "agent.stream.chunk",
  AGENT_STREAM_END: "agent.stream.end",
  USER_PROMPT: "user.prompt",
  SYSTEM_TEAM_LOADED: "system.team.loaded",
  SYSTEM_TEAM_INTERRUPTED: "system.team.interrupted",
  SYSTEM_ERROR: "system.error",
  CUSTOM: "custom.{clientTopic}",
} as const;
export type EventType = (typeof EventTypes)[keyof typeof EventTypes];

type EventDef<S extends Sender, P = null> = { sender: S; payload: P };
type EventDefinitions = {
  [EventTypes.AGENT_TURN_START]: EventDef<AgentSender>;
  [EventTypes.AGENT_IDLE]: EventDef<AgentSender, { stopReason: string, isError: boolean }>;
  [EventTypes.AGENT_TOOL_CALL]: EventDef<AgentSender, {
    tool_call_id: string;
    name: string;
    input: string;
    input_truncated: boolean;
  }>;
  [EventTypes.AGENT_TOOL_RESULT]: EventDef<AgentSender, {
    tool_call_id: string;
    name: string;
    output: string | null;
    output_truncated: boolean;
    duration_ms: number;
    error: string | null;
  }>;
  [EventTypes.AGENT_STREAM_CHUNK]: EventDef<AgentSender, {
    stream_id: number;
    seq: number;
    block_type: "text" | "thinking";
    text: string;
  }>;
  [EventTypes.AGENT_STREAM_END]: EventDef<AgentSender, { stream_id: number; total_chunks: number }>;
  [EventTypes.USER_PROMPT]: EventDef<UserSender, { teamId: string; agentKey: string; prompt: string }>;
  [EventTypes.SYSTEM_TEAM_LOADED]: EventDef<SystemSender, {
    teamId: string;
    agents: Array<{ role: string; agent_key: string; is_leader: boolean }>;
  }>;
  [EventTypes.SYSTEM_TEAM_INTERRUPTED]: EventDef<SystemSender, { teamId: string }>;
  [EventTypes.SYSTEM_ERROR]: EventDef<SystemSender, { error: string }>;
  [EventTypes.CUSTOM]: EventDef<AgentSender, { clientTopic: string; payload: unknown }>;
}

export interface AgentIdentity {
  teamId: string;
  agentRole: string;
  agentKey: string;
}

export interface AgentSender { kind: "agent"; identity: AgentIdentity };
export interface UserSender { kind: "user" };
export interface SystemSender { kind: "system" };
export type Sender = AgentSender | UserSender | SystemSender;

export interface EventEnvelope<T extends EventType> {
  version: 1;
  type: T;
  topic: string;
  sender: EventDefinitions[T]["sender"];
  timestamp: string;
  payload: EventDefinitions[T]["payload"];
}

export const Events = {
  agentTurnStart: (sender: AgentSender) =>
    createEvent(EventTypes.AGENT_TURN_START, sender),
  agentIdle: (sender: AgentSender, stopReason: string, isError: boolean) =>
    createEvent(EventTypes.AGENT_IDLE, sender, { stopReason, isError }),
  agentToolCall: (sender: AgentSender, tool_call_id: string, name: string, input: string, input_truncated: boolean) =>
    createEvent(EventTypes.AGENT_TOOL_CALL, sender, { tool_call_id, name, input, input_truncated }),
  agentToolResult: (sender: AgentSender, tool_call_id: string, name: string, output: string | null, output_truncated: boolean, duration_ms: number, error: string | null) =>
    createEvent(EventTypes.AGENT_TOOL_RESULT, sender, { tool_call_id, name, output, output_truncated, duration_ms, error }),
  agentStreamChunk: (sender: AgentSender, stream_id: number, seq: number, block_type: "text" | "thinking", text: string) =>
    createEvent(EventTypes.AGENT_STREAM_CHUNK, sender, { stream_id, seq, block_type, text }),
  agentStreamEnd: (sender: AgentSender, stream_id: number, total_chunks: number) =>
    createEvent(EventTypes.AGENT_STREAM_END, sender, { stream_id, total_chunks }),
  userPrompt: (sender: UserSender, teamId: string, prompt: string, agentKey: string) =>
    createEvent(EventTypes.USER_PROMPT, sender, { teamId, prompt, agentKey }),
  teamLoaded: (sender: SystemSender, teamId: string, agents: Array<{ role: string; agent_key: string; is_leader: boolean }>) =>
    createEvent(EventTypes.SYSTEM_TEAM_LOADED, sender, { teamId, agents }),
  interruptTeam: (sender: SystemSender, teamId: string) =>
    createEvent(EventTypes.SYSTEM_TEAM_INTERRUPTED, sender, { teamId }),
  systemError: (sender: SystemSender, error: string) =>
    createEvent(EventTypes.SYSTEM_ERROR, sender, { error }),
  custom: (sender: AgentSender, clientTopic: string, payload: unknown) =>
    createEvent(EventTypes.CUSTOM, sender, { clientTopic, payload }),
}

function createEvent<T extends EventType>(type: T, sender: Sender): EventEnvelope<T>;
function createEvent<T extends EventType>(type: T, sender: Sender, payload: EventDefinitions[T]["payload"]): EventEnvelope<T>;
function createEvent(type: EventType, sender: Sender, payload?: EventDefinitions[EventType]["payload"]): EventEnvelope<EventType> {
  return Object.freeze({ version: 1, sender, type, topic: resolveTopic(type, payload), timestamp: new Date().toISOString(), payload: payload ?? null });
}

const PLACEHOLDER_PATTERN = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
function resolveTopic(template: string, payload: EventDefinitions[EventType]["payload"] | null | undefined): string {
  return template.replace(PLACEHOLDER_PATTERN, (placeholder, key: string) => {
    if (payload !== null && payload !== undefined && typeof payload === "object") {
      const value = (payload as Record<string, unknown>)[key];
      if (typeof value === "string") return value;
    }
    throw new Error(`Cannot resolve topic placeholder ${placeholder}: missing ${key} in payload`);
  });
}

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";

function truncateForTelemetry(input: string): { text: string; truncated: boolean } {
  if (input.length <= TRUNCATION_BYTES) return { text: input, truncated: false };
  const half = Math.floor((TRUNCATION_BYTES - 25) / 2);
  const truncatedChars = input.length - half * 2;
  return {
    text: `${input.slice(0, half)}${TRUNCATION_MARKER.replace("%d", String(truncatedChars))}${input.slice(input.length - half)}`,
    truncated: true,
  };
}