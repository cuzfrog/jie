# Monorepo Structure

## Package Layout

```
packages/
  jie-platform/   # Platform runtime lib — composition root: container.ts (bootPlatform, ADR 31)
    command/         # Platform commands (team, resumeSession, setDefaultModel, login, …) + executor
    config/          # Settings, auth, models.json loading, model registry (10-configuration.md)
    core/            # AgentBody: event loop (jie-agent-body.ts), pi-agent wiring, streaming, tool adapter
    event/           # EventBus (InProcessEventBus), EventManager, Events factory (03-event-system.md)
    services/        # GitService (branch / dirty status; consumed by the command surface and by jie-cli for the TUI footer)
    storage/         # Storage + SqliteStorage, schema bootstrap, ArtifactStore, MemoryManager (04-storage.md, 08-memory.md)
    team/            # Blueprint parser, team registry (discovery, ADR 24), TeamManager, built-in minimal/ team
    tools/           # Built-in tools: notify, bash, read_file, write_file, edit, todo_write,
                       web_search, web_fetch, write_artifact, read_artifact + ToolRegistry
    container.ts       # Composition root: bootPlatform(options): AwilixContainer<PlatformCradle> (ADR 31)
    jie-platform.ts  # JiePlatform handle interface + implementation (registered in module.ts)
    jie-platform-errors.ts
  jie-cli/        # CLI entry (jie binary): -p print mode, interactive TUI mode, login/logout/model/team commands
  jie-tui/        # Terminal UI (pi-tui-based inline renderer): chat column, editor, footer, slash commands; bootTui(options, deps)
  mock-llm-backend/  # OpenAI-compatible mock LLM server for e2e tests (bun mock:start)
  jie-team/       # Aspirational dev-team blueprint — package has no code yet (doc/specs/jie-team/)
  code-lens/      # Aspirational AST code-structure MCP server — package has no code yet (doc/specs/code-lens/)
```

## Dependencies

```
jie-cli  → jie-platform, jie-tui   (composition root: calls bootPlatform/bootTui, hands the handle to the TUI / -p mode)
jie-tui  → jie-platform, @earendil-works/pi-tui   (platform surface: JiePlatform handle + wire-format types only)
mock-llm-backend                    (standalone test fixture)
jie-team, code-lens                 (no code, no dependencies)
```

**Agnosticism rule (ADR 11).** `jie-platform` has zero dependency on `jie-team` — no `import` in any form, including types. The platform reads team blueprints from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`) plus its built-in `minimal` fallback; a team is data, not code.

## Build System

**Zero build step.** The runtime is `bun` (>= 1.3.14), which executes TypeScript natively — no compilation, bundling, or transpilation. Source `.ts` files are the distributable.

- **Monorepo tool**: bun workspaces; root `package.json` declares `workspaces: ["packages/*"]`.
- **Version management**: a root `catalog:` block pins every shared dependency version; packages depend via `"catalog:"`. One place to bump; `bun install` never silently changes behavior. Upgrades are explicit decisions (the platform's spec is precise about API shapes — e.g. a pi-agent minor bump has changed `BeforeToolCallContext` in the past).

## Package Entry Points

Every package exports `.` → `./index.ts`; the root `package.json` declares `"bin": { "jie": "packages/jie-cli/index.ts" }`.

`jie-platform/index.ts` re-exports the public surface: `JiePlatform`, `bootPlatform`, `PlatformCradle`, `JiePlatformOptions`, the event protocol types (`EventEnvelope<T>`, `Sender`, `EventType`, topic constants), the command types, and `JiePlatformError` with its codes.

`jie-tui/index.ts` exports `bootTui(options, deps)` — it returns an `AwilixContainer<TuiCradle>`; the `Tui` handle is `cradle.tui`. The TUI's only platform imports are the `JiePlatform` handle and the wire-format event types — no store types (`AuthStore`, `SettingsStore`, `TeamRegistry`, …) reach the TUI's module surface.

## `jie-platform` Runtime Dependencies

Small and fixed (via the root catalog):

| Dependency | Role |
|---|---|
| `@earendil-works/pi-agent-core` | Agent loop: streaming, tool execution, turn management |
| `@earendil-works/pi-ai` | Provider/model definitions, `Model` objects, auth storage backend |
| `typebox` | Tool JSON schemas |
| `yaml` | Team-blueprint frontmatter parsing |
| `ulid` | `session_id` (26 chars — shorter than UUID v4, human-scannable in logs and DB rows) |
| `node-html-parser` | HTML → text for the `web_fetch` tool (bun has no built-in HTML parser) |
| `tslog` | Structured logger, gated by `JIE_LOG_LEVEL` (silent when unset) |
| `awilix` | DI container — per-boot composition (ADR 31): one container per `bootPlatform`/`bootTui` call, CLASSIC constructor injection; also used by jie-cli, jie-tui, and mock-llm-backend |

**Bun built-ins** (no dep): `bun:sqlite` (`SqliteStorage`), `Bun.Glob` (`ToolRegistry` spec resolution), `fetch` (`web_search` / `web_fetch`), `Bun.spawn()` (`bash` tool; MCP stdio servers when the MCP client lands), `Bun.argv` (hand-rolled CLI parser), `import ... with { type: "text" }` (built-in minimal team).

**No MCP SDK today.** MCP client integration is not implemented (ADR 4); `@modelcontextprotocol/sdk` is not a dependency. **No CLI / utility libraries** (`commander`, `lodash`, `chalk`, …): the CLI surface is small enough that hand-rolled parsing and merging stay smaller than the deps. (`awilix` is the DI composition mechanism, not a utility library — ADR 31.)

## Testing

- **Framework**: `bun test` — zero extra dependencies, vitest-compatible API (test utilities are on the global namespace; see `doc/HOW_TO_MOCK.md`).
- **Unit**: co-located `*.test.ts` next to source, aligned one-test-file-per-source-file.
- **E2E**: `tests/e2e/` at repo root, run against the mock LLM backend (`bun mock:start` + `bun test:e2e:mock`) or a real local endpoint (`bun test:e2e:local`). See `doc/DEVELOPMENT.md`.
