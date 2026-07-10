---
sealed:
  - index.ts
  - parser.test.ts
  - parser.ts
  - registry.test.ts
  - registry.ts
  - team-manager.test.ts
  - team-manager.ts
  - text.d.ts
  - types.ts
---

## Contracts

- `TeamManager.load(teamId?)` emits `system.team.loaded` only on fresh loads. Cache hits (the same team already in `loadedTeams`) are silent — no event re-published. Consumers that need to react to *any* team load attempt (including cache-hit re-selections by the TUI's `/team <id>`) must derive from the returned `TeamIdentity` directly, not by waiting for the event. The platform does not own "the team the UI is watching" — that is a UI concern on `Actions.switchTeam`.
- `TeamManager.resolveTeamId(teamId?)` applies the fallback chain in order: explicit `teamId` → `settings.defaultTeam` (when still installed) → first user-installed team (alphabetical, excluding `BUILTIN_MINIMAL_TEAM_ID`) → `BUILTIN_MINIMAL_TEAM_ID`. The platform always has a runnable team.
