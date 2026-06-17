/** A soul declares an agent's behavioral profile. The team-blueprint
 *  loader constructs one per role; the platform then derives
 *  `AgentBody` from each soul at body construction. */
export interface AgentSoul {
  /** Agent identifier — the `.md` filename stem (canonical, see
   *  ADR 16). `agent_key = {role}-{N}`. */
  role: string;

  /** `<provider>/<modelId>` string. Split on `/` at body construction
   *  via pi-ai's `getModel(provider, modelId)`. Empty string when the
   *  frontmatter omits `model:` — startJie fills it from merged
   *  settings. */
  model: string;

  /** Prose body of the agent's `.md` file (after the closing `---`
   *  of the frontmatter). Provided to the LLM as the system message. */
  system_prompt: string;

  /** Tool spec strings from frontmatter `tools:`. Resolved against
   *  the `ToolRegistry` at body construction. */
  tools: string[];

  /** Domain topics from frontmatter `subscribe:`. The team's view is
   *  un-scoped; the platform prefixes `{team_id}.` at body
   *  construction. */
  subscribe: string[];

  /** Team-scoped domain topics. At the loader level this mirrors
   *  `subscribe` (the loader is team-id-agnostic per ADR 14); the
   *  body adds the `{team_id}.` prefix. */
  subscriptions: string[];
}

/** A parsed team blueprint. The loader returns one of these from
 *  every entry point (`loadTeamFromDir`, `loadMinimalTeam`).
 *  `startJie` consumes it: walks `roles` to build `AgentSoul`s,
 *  resolves the leader from `leaderRole`, and constructs one
 *  `AgentBody` per role with `is_leader` set per the
 *  leader-identification rules. The `TeamRegistry.loadTeam` entry
 *  point returns the same shape. */
export interface Team {
  /** Sorted alphabetically by role stem. The order is preserved
   *  through soul construction and body instantiation. The CLI
   *  sources the TUI's `roles` parameter from this list. */
  roles: AgentSoul[];

  /** The role stem of the leader. `null` only for the empty-team
   *  edge case (no `.md` files in the team directory), where `roles`
   *  is also `[]` and the team is silently ignored. For
   *  single-agent teams without `TEAM.md`, this is the single role's
   *  stem (implicit-leader rule). For multi-agent teams, this is
   *  `TEAM.md`'s `leader:` value (and must match one of the role
   *  stems in `roles`). */
  leaderRole: string | null;
}