# Monorepo Structure

## Package Layout

```
packages/
  jie-platform/   # Platform runtime lib — composition root: container.ts (bootPlatform, ADR 31)
    command/         # Platform commands (team, resumeSession, setDefaultModel, login, …) + executor
    config/          # Settings, auth, models.json loading, model registry (10-configuration.md)
    context/         # Auto-loaded context files (AGENTS.md/CLAUDE.md ancestor walk) → loadSystemContextBlock (10-configuration.md "Context Files")
    core/            # AgentBody: event loop (jie-agent-body.ts) and its components (prompt queue, event bridge, tool-call observer, compaction runner, model controller), pi-agent wiring, streaming, tool adapter, system-prompt composition
    event/           # EventBus (InProcessEventBus), EventManager, Events factory (03-event-system.md)
    hooks/           # settings.json command hooks: parse, HookRunner, sh executor; gates tool calls + lifecycle (10-configuration.md "Hooks")
    llm/             # LlmService: one-shot model calls outside agent sessions (compaction, memory extraction) (07-llm-service.md)
    memory/          # MemoryManager facade over MemoryStore (memory_atoms + FTS5), MemoryDistiller, and MemoryBootstrap: team-scoped long-term memory (11-memory.md, ADR 34)
    services/        # GitService (branch / dirty status; consumed by the command surface and by jie-cli for the TUI footer)
    skills/          # Skill discovery (SKILL.md), SkillManager (glob resolution), prompt formatting (10-configuration.md "Skills")
    storage/         # Storage + SqliteStorage, schema bootstrap, ArtifactStore, TranscriptStore (04-storage.md, 08-transcript.md)
    team/            # Blueprint parser, team registry (discovery, ADR 24), TeamManager, built-in default-solo/ team
    tools/           # Built-in tools: notify, bash, read_file, write_file, edit, kanban_write,
                       web_search, web_fetch, write_artifact, read_artifact, memory_search + ToolRegistry
    container.ts       # Composition root: bootPlatform(options): AwilixContainer<PlatformCradle> (ADR 31)
    jie-platform.ts  # JiePlatform handle interface + implementation (registered in module.ts)
    jie-platform-errors.ts
  jie-cli/        # CLI entry (jie binary): -p print mode, interactive TUI mode, login/logout/model commands, team add/list/remove
  jie-tui/        # Terminal UI (pi-tui-based inline renderer): chat column, editor, footer, slash commands; bootTui(options, deps)
  jie-utils/      # Process-level infra shared by all packages: diagnostic logger (tslog), Console output abstraction
  mock-llm-backend/  # OpenAI-compatible mock LLM server for e2e tests (bun mock:start)
  jie-team/       # Shipped team blueprints (the `default-coders` six-role delivery pipeline) - pure content, no code (doc/specs/jie-team/)
  jie-team-installer/  # Team install/remove: npm/git/file sources → `<id>/TEAM.md` dirs; CLI-side, never imported by platform or jie-team (doc/specs/jie-team-installer/, ADR 35)
  code-lens/      # Standalone MCP server (bin: code-lens): code-architecture facts from SCIP indexes (doc/specs/code-lens/)
```

## Dependencies

```
jie-cli  → jie-platform, jie-tui, jie-utils, jie-team-installer   (composition root: calls bootPlatform/bootTui, hands the handle to the TUI / -p mode; team add/remove skip the platform boot and use the installer directly)
jie-tui  → jie-platform, jie-utils, @earendil-works/pi-tui   (platform surface: JiePlatform handle + wire-format types only)
jie-platform → jie-utils
mock-llm-backend → jie-utils        (standalone test fixture)
code-lens → jie-utils               (standalone MCP server; protobufjs for SCIP decoding — runs as a child process, never imported)
jie-team                            (blueprint data only - pure content, no code, no runtime dependencies)
jie-team-installer                  (team install/remove - CLI-side; no runtime dependencies, Bun builtins only)
```

**Agnosticism rule (ADR 11).** `jie-platform` has zero dependency on `jie-team` — no `import` in any form, including types. The platform reads team blueprints from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`) plus its built-in `default-solo` fallback; a team is data, not code.

## Build System

**Zero build step.** The runtime is `bun` (>= 1.3.14), which executes TypeScript natively — no compilation, bundling, or transpilation. Source `.ts` files are the distributable.

- **Monorepo tool**: bun workspaces; root `package.json` declares `workspaces: ["packages/*"]`.
- **Version management**: a root `catalog:` block pins every shared dependency version; packages depend via `"catalog:"`. One place to bump; `bun install` never silently changes behavior. Upgrades are explicit decisions (the platform's spec is precise about API shapes — e.g. a pi-agent minor bump has changed `BeforeToolCallContext` in the past).

## Package Entry Points

Every code package exports `.` → `./index.ts` (`jie-team` is the exception: pure content with no entry point, consumed by the installer scanning its files); the root `package.json` declares `"bin": { "jie": "packages/jie-cli/index.ts" }`.

`jie-platform/index.ts` re-exports the public surface: `JiePlatform`, `bootPlatform`, `PlatformCradle`, `JiePlatformOptions`, the event protocol types (`EventEnvelope<T>`, `Sender`, `EventType`, topic constants), the command types, and `JiePlatformError` with its codes.

`jie-tui/index.ts` exports `bootTui(options, deps)` — it returns an `AwilixContainer<TuiCradle>`; the `Tui` handle is `cradle.tui`. The TUI's only platform imports are the `JiePlatform` handle and the wire-format event types — no store types (`AuthStore`, `SettingsStore`, `TeamRegistry`, …) reach the TUI's module surface.

`jie-utils/index.ts` exports `logger` (a tslog instance gated by `JIE_LOG_LEVEL`) and `Console` / `defaultConsole` — the output abstraction CLI commands write through and the logger's transport routes to stderr. It depends on no other jie package; diagnostic logging is orthogonal to app logic and is imported as a module-scope instance, not injected.

`jie-team` has no `index.ts` - it is pure content: the `default-coders` blueprint directories live at the package root (`<id>/TEAM.md` + `<role>.md`) with no code, no install hook, and no runtime surface (ADR 11). `jie-team-installer/index.ts` exports `createTeamInstaller` (and `parseTeamSource`) - the CLI-side installer that resolves an npm/git/file source, copies its `<id>/TEAM.md` directories into `.jie/teams/` (project) or `~/.jie/teams/` (user), and records provenance; the platform later discovers the installed copies from the filesystem (ADR 11 agnosticism, ADR 35).

`code-lens/index.ts` is the minimal library surface (SCIP ingestion + `CodeIndex` model); the executable surface is the `code-lens` bin (`main.ts`), a stdio MCP server the platform spawns as a child process rather than imports.

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
| `awilix` | DI container — per-boot composition (ADR 31): one container per `bootPlatform`/`bootTui` call, CLASSIC constructor injection; also used by jie-cli, jie-tui, and mock-llm-backend |

`jie-utils`' only runtime dependency is `tslog` (structured logger, gated by `JIE_LOG_LEVEL`; silent when unset). `code-lens`' only runtime dependency is `protobufjs` (SCIP protobuf decoding via vendored generated bindings).

**Bun built-ins** (no dep): `bun:sqlite` (`SqliteStorage`), `Bun.Glob` (`ToolRegistry` spec resolution), `fetch` (`web_search` / `web_fetch`), `Bun.spawn()` (`bash` tool; MCP stdio subprocesses), `Bun.argv` (hand-rolled CLI parser), `import ... with { type: "text" }` (built-in default-solo team).

**Still no MCP SDK.** The MCP client (stdio transport) is a hand-rolled JSON-RPC implementation in `packages/jie-platform/mcp/` (ADR 4), and code-lens's server side is equally hand-rolled; `@modelcontextprotocol/sdk` is not a dependency. **No CLI / utility libraries** (`commander`, `lodash`, `chalk`, …): the CLI surface is small enough that hand-rolled parsing and merging stay smaller than the deps. (`awilix` is the DI composition mechanism, not a utility library — ADR 31.)

## Testing

- **Framework**: `bun test` — zero extra dependencies, vitest-compatible API (test utilities are on the global namespace; see `doc/HOW_TO_MOCK.md`).
- **Unit**: co-located `*.test.ts` next to source, aligned one-test-file-per-source-file.
- **E2E**: `tests/e2e/` at repo root, run against the mock LLM backend (`bun mock:start` + `bun test:e2e:mock`) or a real local endpoint (`bun test:e2e:local`). See `doc/DEVELOPMENT.md`.
