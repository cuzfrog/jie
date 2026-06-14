/** AgentEvent — the wire-format envelope every publisher (body, TUI,
 *  CLI) constructs and publishes. The bus's `publish(subject, payload)`
 *  second argument is the envelope; subscribers receive the same
 *  envelope on their callback. */
export interface AgentEvent<T extends string = string> {
  version: 1;
  team_id: string;
  event_type: T;
  agent_role: string;
  agent_key: string;
  timestamp: string;
  payload: Record<string, unknown>;
}