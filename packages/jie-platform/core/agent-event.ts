/** AgentEvent — the wire-format envelope every publisher (body, TUI,
 *  CLI) constructs and publishes. The bus's `publish(subject, payload)`
 *  second argument is the envelope; subscribers receive the same
 *  envelope on their callback.
 *
 *  `agent_role` and `agent_key` are optional: per-body events
 *  (e.g. `agent.turn.start`, `agent.idle`, `agent.stream.chunk`,
 *  `agent.tool.call`) always fill them; team-level events
 *  (e.g. `team.loaded`) are published by the handle and omit
 *  them since there is no single body that "owns" the event. */
export interface AgentEvent<T extends string = string> {
  version: 1;
  team_id: string;
  event_type: T;
  agent_role?: string;
  agent_key?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}