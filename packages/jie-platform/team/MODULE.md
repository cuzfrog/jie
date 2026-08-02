---
no-new-exports:
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
- `TeamInfo.history` always carries each body's live conversation — the restored messages on a fresh load, the agent's current messages on a cache hit. Both the `system.team.loaded` payload and the returned identity are built from the bodies at call time, so the TUI hydrates its conversation display from either source; an entry with empty `messages` preserves the existing display slot (see `ui/tui-state.md` resume hydration).
- `TeamManager.resolveTeamId(teamId?)` applies the fallback chain in order: explicit `teamId` → `settings.defaultTeam` (when still installed) → first user-installed team (alphabetical, excluding `BUILTIN_MINIMAL_TEAM_ID`) → `BUILTIN_MINIMAL_TEAM_ID`. The platform always has a runnable team.
- `TeamManager.reload()` first refreshes the process-lifetime caches (`ModelRegistry.reload()`, `SkillManager.reload()`), then rebuilds every loaded team in place on its current session id — old bodies are stopped, manifests/settings are re-read, and `system.team.loaded` is re-published per team — and returns the rebuilt identities. Rebuilds bypass the `hasSession` validation of a fresh load because a zero-message session is valid. Teams not yet loaded are unaffected; the load-time cache-hit contract above is unchanged.
