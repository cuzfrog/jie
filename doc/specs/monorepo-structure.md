# Monorepo Structure

## Package Layout

```
packages/
  code-lens/      # Standalone MCP server: AST-only code structure queries (out of scope for v1 MVP — see ADR 15)
  jie-platform/   # Platform runtime lib — barrel entry: index.ts
    start.ts         # Entry function: createJiePlatform(opts, deps): JiePlatform (ADR 13)
    core/            # EventBus, AgentBody, AgentSoul, Tool interface & registry, tool-error
    storage/         # Storage abstraction (04-storage.md):
                       storage.ts        # Storage interface (exec/query/transaction/close)
                       sqlite-storage.ts # SqliteStorage — default backend
                       init-db.ts        # initializeSchema(storage) — single-version schema bootstrap
                       artifact-store.ts # ArtifactStore interface + SqliteArtifactStore impl
                       memory-store.ts   # MemoryManager interface + SqliteMemoryManager impl
                       index.ts          # barrel
    tools/           # Built-in tools: notify, bash, read_file, write_file, web_search, web_fetch, write_artifact, read_artifact
                       (each tool has its own .ts; index.ts is the barrel)
    team/            # Team-blueprint loader (ADR 14):
                       loader.ts         # parseTeamFromManifests, loadTeamFromDir, loadMinimalTeam
                       minimal/          # Built-in last-resort fallback — same .md format as user teams
                         TEAM.md
                         general.md
    index.ts         # Barrel: re-exports all public APIs
  jie-tui/        # Terminal UI: stub in v1 (throws "TUI not implemented"). See ADR 15.
  jie-cli/        # CLI entry point (jie binary) — v1 ships `jie -p` plus `login`/`logout`/`model`/`team` setup commands. ADR 15.
  jie-team/       # Manifest package: out of scope for v1 MVP. Placeholder package.json only. See ADR 11 / ADR 15.
```

## Dependencies

```
jie-cli → jie-platform  (composition root: constructs stores, calls `createJiePlatform`, hands the facade to TUI/CLI commands; the facade hides every store from the CLI's command modules)
jie-cli → jie-tui       (passes the `JiePlatform` facade to `createTui`)
jie-tui → jie-platform  (only `JiePlatform` and the wire-format types `EventEnvelope<T>`, `AnyEventEnvelope`, `EventType`; no store types reach the TUI's module surface)
jie-team → jie-platform (types: AgentSoul, ToolSpec — dev only, erased at runtime)
code-lens               (standalone — no jie dependencies)
```

`jie-team` is a sibling of the platform, not a dependency. The CLI does not depend on it; the platform does not import it. `jie-team` is a manifest package — a folder of `.md` files that users place at the standard paths by hand.

**Agnosticism rule (ADR 11).** `jie-platform` has zero runtime dependency on `jie-team` — no `import` in any form, including types. The platform reads team manifests from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`). The `jie-team` package is a passive source of manifests, not an install hook; the user copies its files into the standard paths.

## Build System

**Zero build step.** The runtime is `bun` (>= 1.3.14), which executes TypeScript natively. No compilation, no bundling, no transpilation. Source `.ts` files are the distributable.

- **Monorepo tool**: bun workspaces. Root `package.json` declares `workspaces: ["packages/*"]`.
- **No build script**: Distributing TypeScript source executed by bun.

## Package Entry Points

```jsonc
// packages/jie-platform/package.json
{
  "name": "@cuzfrog/jie-platform",
  "exports": { ".": "./index.ts" }
}

// packages/jie-tui/package.json
{
  "name": "@cuzfrog/jie-tui",
  "exports": { ".": "./index.ts" }
}

// packages/jie-team/package.json
{
  "name": "@cuzfrog/jie-team",
  "files": ["teams/"]
}
```

`jie-platform/index.ts` re-exports the facade: `JiePlatform`, `createJiePlatform`, the event protocol types (`EventEnvelope<T>`, `AnyEventEnvelope`, `EventType`), and `JiePlatformError` with its codes. `GitSnapshot` is re-exported so consumers do not need to reach into `jie-platform/services`.

`jie-tui/index.ts` exports the TUI component function: `createTui(deps: { platform: JiePlatform }, options: CreateTUIOptions)`. The TUI's only platform import is the facade and the wire-format types; it does not import `AuthStore`, `SettingsStore`, `TeamRegistry`, `GitService`, or any other store type.

## `jie-platform` Runtime Dependencies

The platform's runtime dep set is small and fixed. Bun provides most of what the platform needs as built-ins; the five runtime deps cover the rest.

```jsonc
// packages/jie-platform/package.json
{
  "name": "@cuzfrog/jie-platform",
  "type": "module",
  "exports": { ".": "./index.ts" },
  "dependencies": {
    "@earendil-works/pi-agent-core": "0.79.1",
    "@earendil-works/pi-ai":          "0.79.1",
    "typebox":                        "1.1.38",
    "yaml":                           "2.9.0",
    "ulid":                           "2.3.0",
    "node-html-parser":               "6.1.13"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript":  "^5.9.3"
  }
}
```

**Bun built-ins** (no dep): `bun:sqlite` (default `Storage` backend), `Bun.Glob` (for `mcp:server:*` resolution in `ToolRegistry`), `fetch` (for `web_search` / `web_fetch` tools), `Bun.spawn()` (for `bash` tool and (Day 2) MCP stdio servers), `Bun.argv` (hand-rolled CLI parser), `fs` / `fs/promises` / `path`, `import ... with { type: 'text' }` (for the built-in minimal team per ADR 14). The platform uses `ulid@2.3.0` for `session_id` (26 chars, shorter than UUID v4 and human-scannable in logs and DB rows) rather than `crypto.randomUUID()`; `node-html-parser@6.1.13` parses HTML responses for the `web_fetch` tool (Bun has no built-in HTML parser); see "Fixed pins" below for why a dep was chosen over a built-in.

**Fixed pins, no `^`.** The platform's spec is precise about API shapes. A pi-agent minor version bump can change `BeforeToolCallContext` (it has, between pre-0.75 and 0.79.1). A `yaml` major version bump can change the parse output. Fixed pins mean a `bun install` does not silently change behavior; upgrades are explicit ADR-grade decisions. The pinned `typebox@1.1.38` and `yaml@2.9.0` are the transitive versions of `@earendil-works/pi-agent-core@0.79.1`, so jie and pi-agent share known-good combinations. The pinned `ulid@2.3.0` is the canonical Node/bun ULID implementation; its API is one function (`ulid()`) and is stable, so a fixed pin is the right call.

**No MCP SDK in v1.** Per ADR 15, MCP client integration is Day 2. `@modelcontextprotocol/sdk@1.29.0` (the standard) is **not** a v1 dep. The `mcp.json` schema in `10-configuration.md` is forward-looking; the platform's `startJie` does not load it in v1.

**No CLI / utility libraries.** No `commander` / `yargs` / `lodash` / `picomatch` / `inquirer` / `chalk`. The v1 CLI surface is small (`-p`, `--team`, `--api-key`, `--resume`, `--version`, `--help`, plus `login` / `logout` / `model` / `team` subcommands); a 20-line manual parser over `Bun.argv` is smaller than the dep. Settings deep-merge is three top-level scalar fields; an 8-line function is smaller than `lodash.merge`. If the CLI grows, the swap to `commander` is a single-file change.

## Umbrella Package

```jsonc
// package.json (root)
{
  "name": "@cuzfrog/jie",
  "workspaces": ["packages/*"],
  "dependencies": {
    "@cuzfrog/jie-platform": "workspace:*",
    "@cuzfrog/jie-tui": "workspace:*"
  },
  "bin": {
    "jie": "packages/jie-cli/index.ts"
  }
}
```

`bun install -g @cuzfrog/jie` installs the workspace set. The binary is `jie` → `packages/jie-cli/index.ts`. `jie-team` and `code-lens` are workspace packages, not runtime dependencies — `jie-team` ships manifests, `code-lens` is out of scope for the platform MVP (ADR 15).

## Testing

- **Framework**: `bun test`. Zero extra dependencies, Jest/vitest-compatible API.
- **Unit/Integration**: co-located `*.test.ts` files alongside source.
- **E2E**: `tests/e2e/` at repo root. Spin up a full team (EventBus + AgentBodies + ArtifactStore), inject prompts via EventBus, verify pipeline events and artifact store outcomes.
- **Command**: `bun test` runs all tests across the workspace.
