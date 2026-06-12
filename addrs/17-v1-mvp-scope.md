# ADR 17: v1 MVP Scope — TUI Stub, jie-cli Subset, jie-team/code-lens Out

## Status

Accepted. Defines what is and is not in the v1 MVP of jie-platform, given that the goal is a runnable, deployable, usable application and the project's scope is jie-platform only.

## Context

`monorepo-structure.md` defines five packages in the umbrella:

- `jie-platform` — the platform runtime
- `jie-cli` — the `jie` binary (supervisor + command dispatch)
- `jie-tui` — the terminal UI
- `jie-team` — a manifest package (per ADR 12: a directory of `.md` files)
- `code-lens` — a standalone MCP server

The spec has scenarios that exercise the TUI (`00-user-scenarios.md` scenarios 1, 2, 3, 6, 9) and one that doesn't (`jie -p` scenarios 4, 5). It also references `jie-team` as a separate package and `code-lens` as an MCP server.

For a v1 MVP whose scope is jie-platform, three questions are open:

1. **TUI**: Do we build a working TUI in v1, or do we stub `packages/jie-tui/` and ship `-p` mode only?
2. **jie-cli scope**: What subset of `ui/cli.md` does v1 ship?
3. **jie-team and code-lens**: The user instructed "forget about jie-team and code-lens" — what does that mean for the repo layout and the platform's dependencies?

A pre-implementation review surfaced that all three are within the user's "scope is only jie-platform" framing, and ADR 12 already settles the package-boundary question for jie-team. What remains is: how do we cut v1 down to ship a runnable platform without dragging in TUI / CLI / team / code-lens work that the user has not signed off on.

## Decision

### TUI: stub in v1

`packages/jie-tui/index.ts` exports a `startTUI` function whose body throws `Error("TUI not implemented in v1 MVP")`. The function exists so the CLI can import the type and call the entry; the runtime behavior is a deliberate fail. The `monorepo-structure.md` TUI description remains the long-term contract; v1 ships the contract, not the implementation.

Rationale: a working TUI is a separate project — UI library choice, keybinding design, agent-panel rendering, queue-update indicator, slash-command autocomplete, all of which are out of scope for "ship the platform's runtime". Stubbing the TUI lets the platform's runtime be tested end-to-end via `-p` mode and unit tests, without blocking on TUI design.

### jie-cli: `-p` plus setup commands

`packages/jie-cli/` ships the minimum command set needed to exercise the platform end-to-end:

- `jie -p <instruction>` (one-shot print mode, per `ui/cli.md` "jie -p")
- `jie --print <instruction>` (alias for `-p`)
- `jie --version`, `jie --help`
- `jie login` / `jie logout` (per `ui/cli.md`; the `jie login` interactive flow may be limited to `--provider <id> --api-key <key>` for headless use in v1)
- `jie model <provider>/<modelId>` (per `ui/cli.md`)
- `jie team <id>` / `jie team` / `jie team --unset` (per `ui/cli.md`)
- `jie --resume <session_id>` / `jie --continue`
- `jie --api-key <key>`

`jie` (no flag, interactive TUI) is **not** implemented in v1; it prints an error and exits 1 ("TUI not implemented in v1 MVP; use `jie -p`"). This makes the missing-TUI state explicit at the user surface, not a silent fallback.

### jie-team and code-lens: out of scope

Per the user's direction, jie-team and code-lens are out of the v1 MVP scope.

In the repo:

- `packages/jie-team/package.json` exists as a placeholder with `name: "@cuzfrog/jie-team"`, `files: ["teams/"]` per ADR 12, and an empty `teams/` directory. No install hook, no `postinstall`. The package is not a dependency of `jie-platform` or `jie-cli`; the umbrella `package.json` may or may not list it as a workspace.
- `packages/code-lens/` does not exist in v1. The platform's `mcp.json` schema (forward-looking, Day 2 per `10-configuration.md` "MCP Server Configuration") supports it, and a user with code-lens installed can configure it via `.jie/mcp.json`. The platform's MCP client is generic and not code-lens-specific (per `09-deployment.md` "Code-Lens is generic MCP" and ADR 4). The `specs/code-lens/` documentation remains as the contract for a future implementation.

### MVP scope statement

The v1 MVP is:

- `packages/jie-platform/` — full implementation (EventBus, AgentBody, ToolRegistry, all built-in tools, team-blueprint loader, built-in minimal team as `.md` files, Storage abstraction with SQLite default, MemoryManager, startJie entry function, etc.)
- `packages/jie-cli/` — minimal harness (`-p` mode + setup commands)
- `packages/jie-tui/` — stub (throws on call)
- `packages/jie-team/` — placeholder package.json
- (no `packages/code-lens/`)
- root `package.json` (umbrella) with `workspaces: ["packages/*"]`

What v1 does **not** include:

- A working TUI (TUI scenarios are deferred until a TUI library is chosen and the package is implemented).
- **MCP client integration.** The platform's `startJie` does not connect to MCP servers in v1. The `mcp.json` schema in `10-configuration.md` is forward-looking (Day 2). The `ToolRegistry`'s `mcp:<server>:<tool>` and `mcp:<server>:*` spec syntax returns zero matches in v1, so an agent `.md` that lists MCP tools fails the cascade-policy startup check. The dev team (when jie-team ships) will rely on MCP; v1 cannot run it.
- The dev team (DM/Researcher/Architect/Planner/Implementer/Reviewer) manifests — these live in `jie-team`, which is out of scope. The platform ships only the built-in minimal team (1 role, 1 tool list). User teams can be added by hand to `.jie/teams/<id>/`.
- Code-lens integration. Teams that depend on code-lens are not runnable in v1; the cascade policy still applies if a user configures code-lens in `mcp.json` and references its tools in a team manifest.
- Compaction, prompt-queue cap, NATS, multi-process deployment, multi-instance roles (all in the existing `backlog.md` Day 2+ items).

## Rationale

- **The platform's runtime is the deliverable.** The user's framing is "jie-platform MVP". The TUI, jie-team, and code-lens are downstream consumers; their absence does not prevent the platform from being runnable end-to-end (via `-p` mode + the built-in minimal team).
- **Stubbing the TUI is honest, not a shortcut.** A throw-stub is a clear signal: "this is a contract, the implementation is Day 2". A silent fallback to `-p` would hide the gap.
- **jie-team's role is already settled by ADR 12.** The package exists as a manifest source; the platform is agnostic of it. For v1, the user has no dev team to install — the built-in minimal team is the only running option. This is fine: `12-installation.md` "First-Run Credentials and Model" already frames v1 as "login + model + `jie`" and the platform's built-in is the last-resort fallback.
- **MCP code-lens integration is not platform code.** The platform's MCP client is generic (per ADR 4). Code-lens ships separately, when its maintainers ship it. v1 is unaffected by its absence.
- **MVP scope is a list, not a vague direction.** Naming what is and is not in v1 prevents scope creep during implementation. Day 2 / Day 3 items stay in `backlog.md`; v1 is the list above.

## Consequences

- `packages/jie-tui/index.ts` exists and throws. The CLI imports the symbol so the type-check passes; calling it is a runtime failure.
- `packages/jie-cli/index.ts` is the binary entry; it implements `-p`, `login`, `logout`, `model`, `team`, `--resume`/`--continue`, `--api-key`, `--version`, `--help`. It does **not** implement `jie` (no flag) — that path exits 1 with a "TUI not implemented" message.
- `packages/jie-team/package.json` is a placeholder; the `teams/` directory is empty in v1. The umbrella's root `package.json` may list it as a workspace (to keep the layout consistent with `monorepo-structure.md`) but no platform code imports it.
- The platform's `startJie` returns a `JieHandle` whose `swapTeam` method's user-team lookup uses the standard-path resolution per `10-configuration.md`. With no user teams installed and no dev team shipped, `loadMinimalTeam()` is the only team the v1 MVP can resolve to (after the user runs `jie login` and `jie model`).
- `00-user-scenarios.md` scenarios that require the TUI (1, 2, 3, 6, 9) are documented as **deferred**. Scenarios 4, 5 (`jie -p` mode) and 6's setup flow (`jie login`, `jie model`) are the v1 test surface. The TUI scenarios re-enter the test plan when `packages/jie-tui/` is implemented.
- `backlog.md` gains (or re-orders) entries for: TUI implementation, dev team manifests, jie-team package, code-lens package. They are Day 2+ items; v1 does not deliver them.
- The "v1 scope" prose is added to `12-installation.md` "First-Run Credentials and Model" to make the MVP boundary visible to users.
