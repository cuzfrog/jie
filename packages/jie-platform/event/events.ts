type EventDef<S extends Sender, P = null> = { sender: S; payload: P };
type EventDefinitions = {
  "agent.turn.start": EventDef<AgentSender>;
  "agent.idle": EventDef<AgentSender, { stopReason: string, isError: boolean }>;
  "agent.tool.call": EventDef<AgentSender, {
    tool_call_id: string;
    name: string;
    input: string;
    input_truncated: boolean;
  }>;
  "agent.tool.result": EventDef<AgentSender, {
    tool_call_id: string;
    name: string;
    output: string | null;
    output_truncated: boolean;
    duration_ms: number;
    error: string | null;
  }>;
  "agent.stream.chunk": EventDef<AgentSender, {
    stream_id: number;
    seq: number;
    block_type: "text" | "thinking";
    text: string;
  }>;
  "agent.stream.end": EventDef<AgentSender, { stream_id: number; total_chunks: number }>;
  "user.prompt": EventDef<UserSender, { teamId: string; agentKey: string; prompt: string }>;
  "system.team.loaded": EventDef<SystemSender, {
    teamId: string;
    agents: Array<{ role: string; agent_key: string; is_leader: boolean }>;
  }>;
  "system.team.interrupted": EventDef<SystemSender, { teamId: string }>;
  "system.error": EventDef<SystemSender, { error: string }>;
  [topic: `custom.${string}`]: EventDef<AgentSender, string>;
}
export type EventType = keyof EventDefinitions;

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
  agentTurnStart: (sender: AgentSender): EventEnvelope<"agent.turn.start"> =>
    createEvent("agent.turn.start", sender),
  agentIdle: (sender: AgentSender, stopReason: string, isError: boolean): EventEnvelope<"agent.idle"> =>
    createEvent("agent.idle", sender, { stopReason, isError }),
  agentToolCall,
  agentToolResult,
  agentStreamChunk: (sender: AgentSender, stream_id: number, seq: number, block_type: "text" | "thinking", text: string): EventEnvelope<"agent.stream.chunk"> =>
    createEvent("agent.stream.chunk", sender, { stream_id, seq, block_type, text }),
  agentStreamEnd: (sender: AgentSender, stream_id: number, total_chunks: number): EventEnvelope<"agent.stream.end"> =>
    createEvent("agent.stream.end", sender, { stream_id, total_chunks }),
  userPrompt: (sender: UserSender, teamId: string, prompt: string, agentKey: string): EventEnvelope<"user.prompt"> =>
    createEvent("user.prompt", sender, { teamId, prompt, agentKey }),
  teamLoaded: (sender: SystemSender, teamId: string, agents: Array<{ role: string; agent_key: string; is_leader: boolean }>): EventEnvelope<"system.team.loaded"> =>
    createEvent("system.team.loaded", sender, { teamId, agents }),
  interruptTeam: (sender: SystemSender, teamId: string): EventEnvelope<"system.team.interrupted"> =>
    createEvent("system.team.interrupted", sender, { teamId }),
  systemError: (sender: SystemSender, error: string): EventEnvelope<"system.error"> =>
    createEvent("system.error", sender, { error }),
  custom: (sender: AgentSender, clientTopic: string, payload: string): EventEnvelope<`custom.${string}`> =>
    createEvent(`custom.${clientTopic}`, sender, payload),
}

function agentToolCall(sender: AgentSender, tool_call_id: string, name: string, input: string): EventEnvelope<"agent.tool.call"> {
  const { text, truncated } = truncateForTelemetry(input);
  return createEvent("agent.tool.call", sender, { tool_call_id, name, input: text, input_truncated: truncated });
}
function agentToolResult(sender: AgentSender, tool_call_id: string, name: string, output: string | null, duration_ms: number, error: string | null): EventEnvelope<"agent.tool.result"> {
  const { text, truncated } = truncateForTelemetry(output);
  return createEvent("agent.tool.result", sender, { tool_call_id, name, output: text, output_truncated: truncated, duration_ms, error });
}

function createEvent<T extends EventType>(type: T, sender: Sender): EventEnvelope<T>;
function createEvent<T extends EventType>(type: T, sender: Sender, payload: EventDefinitions[T]["payload"]): EventEnvelope<T>;
function createEvent(type: EventType, sender: Sender, payload?: EventDefinitions[EventType]["payload"]): EventEnvelope<EventType> {
  return Object.freeze({ version: 1, sender, type, topic: type, timestamp: new Date().toISOString(), payload: payload ?? null });
}

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";

function truncateForTelemetry<T extends string | null>(input: T): { text: T; truncated: boolean } {
  if (!input) return { text: input, truncated: false };
  if (input.length <= TRUNCATION_BYTES) return { text: input, truncated: false };
  const half = Math.floor((TRUNCATION_BYTES - 25) / 2);
  const truncatedChars = input.length - half * 2;
  return {
    text: `${input.slice(0, half)}${TRUNCATION_MARKER.replace("%d", String(truncatedChars))}${input.slice(input.length - half)}` as T,
    truncated: true,
  };
}
