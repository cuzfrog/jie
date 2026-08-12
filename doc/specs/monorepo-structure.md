# Monorepo Structure

## Module Layout

One publishable package, `@cuzfrog/jie`, rooted at the repo root. Source lives under `src/`; the mock-only LLM server lives under `tests/`. Each `src/` directory is a module gated by its own `MODULE.md`.

```
src/
  platform/         # Platform runtime - composition root: container.ts
    command/           # Platform commands (team, resumeSession, setDefaultModel, login, ...) + executor
    config/            # Settings, auth, models.json loading, model registry (10-configuration.md)
    context/           # Auto-loaded context files (AGENTS.md/CLAUDE.md ancestor walk) -> loadSystemContextBlock (10-configuration.md "Context Files")
    core/              # AgentBody: event loop (jie-agent-body.ts) and its components (prompt queue, event bridge, tool-call observer, compaction runner, model controller), pi-agent wiring, streaming, tool adapter, system-prompt composition
    event/             # EventBus (InProcessEventBus), EventManager, Events factory (03-event-system.md)
    hooks/             # settings.json command hooks: parse, HookRunner, sh executor; gates tool calls + lifecycle (10-configuration.md "Hooks")
    llm/               # LlmService: one-shot model calls outside agent sessions (compaction, memory extraction) (07-llm-service.md)
    memory/            # MemoryManager facade over MemoryStore (memory_atoms + FTS5), MemoryDistiller, and MemoryBootstrap: team-scoped long-term memory
    services/          # GitService (branch / dirty status; consumed by the command surface and by the CLI for the TUI footer)
    skills/            # Skill discovery (SKILL.md), SkillManager (glob resolution), prompt formatting (10-configuration.md "Skills")
    storage/           # Storage + SqliteStorage, schema bootstrap, ArtifactStore, TranscriptStore (04-storage.md, 08-transcript.md)
    team/              # Blueprint parser, team registry (discovery, ADR 24), TeamManager, built-in default-solo/ team
    tools/             # Built-in tools: notify, bash, read_file, write_file, edit, write_kanban,
                       web_search, web_fetch, write_artifact, read_artifact, memory_search + ToolRegistry
    container.ts       # Composition root: bootPlatform(options): AwilixContainer<PlatformCradle>
    jie-platform.ts    # JiePlatform handle interface + implementation (registered in module.ts)
    jie-platform-errors.ts
  cli/             # CLI entry (jie binary): -p print mode, interactive TUI mode, login/logout/model commands, team add/list/remove
  tui/             # Terminal UI (pi-tui-based inline renderer): chat column, editor, footer, slash commands; bootTui(options, deps)
  utils/           # Process-level infra shared by all modules: diagnostic logger (tslog), Console output abstraction
  teams-installer/  # Team install/remove: npm/git/file sources -> `<id>/TEAM.md` dirs; CLI-side, never imported by platform or teams (ADR 35)
  teams/    # Shipped team blueprints (the `default-dev-team` six-role delivery pipeline) - pure content, no code (doc/specs/jie-team/)
  code-lens/       # Standalone MCP server (bin: code-lens): code-architecture facts from SCIP indexes (doc/specs/code-lens/)
tests/
  mock-llm-backend/  # OpenAI-compatible mock LLM server for e2e tests (bun mock:start)
  e2e/               # End-to-end tests, run against the mock backend or a real local endpoint
  support/           # Shared e2e fixtures and helpers
```

## Internal Dependencies

The package boundary is gone; these are module-to-module imports (relative paths). DI carries the runtime boundaries (ADR 31): `bootPlatform` and `bootTui` are separate awilix containers, so the TUI reaches the platform only through the `JiePlatform` handle - never platform internals.

```
cli          -> platform, tui, utils, teams-installer   (composition root: calls bootPlatform/bootTui, hands the handle to the TUI / -p mode; team add/remove skip the platform boot and use the installer directly)
tui          -> platform, utils, @earendil-works/pi-tui (platform surface: JiePlatform handle + wire-format types only)
platform     -> utils
teams-installer                                (team install/remove - CLI-side; no runtime dependencies, Bun builtins only)
teams                                  (blueprint data only - pure content, no code, no runtime dependencies)
code-lens   -> utils                           (standalone MCP server; protobufjs for SCIP decoding - runs as a child process, never imported)
```

**Agnosticism rule (ADR 11).** `platform` has zero dependency on `teams` - no `import` in any form, including types. The platform reads team blueprints from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`) plus its built-in `default-solo` fallback; a team is data, not code. The bundled `default-dev-team` blueprint at `src/teams/default-dev-team/` is reached only after first-run auto-install (D1) copies it to `~/.jie/teams/`.

## Build System
`bun` (>= 1.3.14) runs TypeScript natively; no build step. `package.json` at root: `"files": ["src"]`, `"bin": {"jie": "src/cli/index.ts", "code-lens": "src/code-lens/main.ts"}`.

## Module Entry Points

Each code module exports `.` -> `./index.ts` (`teams` is the exception: pure content with no entry point, consumed by the installer scanning its files).

`src/platform/index.ts` re-exports the public surface: `JiePlatform`, `bootPlatform`, `PlatformCradle`, `JiePlatformOptions`, the event protocol types (`EventEnvelope<T>`, `Sender`, `EventType`, topic constants), the command types, and `JiePlatformError` with its codes.

`src/tui/index.ts` exports `bootTui(options, deps)` - it returns an `AwilixContainer<TuiCradle>`; the `Tui` handle is `cradle.tui`. The TUI's only platform imports are the `JiePlatform` handle and the wire-format event types - no store types (`AuthStore`, `SettingsStore`, `TeamRegistry`, ...) reach the TUI's module surface.

`src/utils/index.ts` exports `logger` (a tslog instance gated by `JIE_LOG_LEVEL`) and `Console` / `defaultConsole` - the output abstraction CLI commands write through and the logger's transport routes to stderr. It depends on no other module; diagnostic logging is orthogonal to app logic and is imported as a module-scope instance, not injected.

`src/teams/` has no `index.ts` - it is pure content: the `default-dev-team` blueprint directories live at the module root (`<id>/TEAM.md` + `<role>.md`) with no code, no install hook, and no runtime surface (ADR 11). `src/teams-installer/index.ts` exports `createTeamInstaller` (and `parseTeamSource`) - the CLI-side installer that resolves an npm/git/file source, copies its `<id>/TEAM.md` directories into `.jie/teams/` (project) or `~/.jie/teams/` (user), and records provenance; the platform later discovers the installed copies from the filesystem (ADR 11 agnosticism, ADR 35).

`src/code-lens/index.ts` is the minimal library surface (SCIP ingestion + `CodeIndex` model); the executable surface is the `code-lens` bin (`main.ts`), a stdio MCP server the platform spawns as a child process rather than imports.

## Runtime Dependencies
Pinned at root (`package.json`): `pi-agent-core`, `pi-ai`, `pi-tui`, `typebox`, `yaml`, `ulid`, `node-html-parser`, `protobufjs`, `tslog`, `awilix`, `cli-highlight`. No MCP SDK; no CLI utility libs (`commander`, etc.). Bun built-ins (`sqlite`, `Glob`, `fetch`, `spawn`) used where possible.

## Testing
`bun test`. Unit: co-located `*.test.ts`. E2E: `tests/e2e/` (mock `bun mock:start` or real endpoint). See `doc/DEVELOPMENT.md`.
