export interface EventPayloadMap {
  "agent.turn.start": Record<string, never>;
  "agent.idle": Record<string, never>;
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
  "leader.prompt": { prompt: string };
  "user.prompt": { prompt: string };
  "team.loaded": { agents: Array<{ role: string; agent_key: string; is_leader: boolean }> };
}

export interface AgentIdentity {
  teamId: string;
  agentRole?: string;
  agentKey?: string;
}

export type Sender =
  | { kind: "agent"; identity: AgentIdentity }
  | { kind: "cli" }
  | { kind: "tui" };

export interface EventEnvelope<T extends string = string> {
  version: 1;
  event_type: T;
  sender: Sender;
  timestamp: string;
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>;
}