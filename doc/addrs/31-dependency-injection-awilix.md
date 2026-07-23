# ADR 31: Dependency Injection via awilix

## Status

Accepted. All packages compose their services through awilix containers (`InjectionMode.CLASSIC`), following the pattern of `/home/cuz/workspace/beep/src/container.ts`. This supersedes the "no class means no false promises … DI the platform does not need" rationale in ADR 13; the entry-function decision itself survives — `createJiePlatform` becomes `bootPlatform`, same role, container-shaped result.

## Decision

1. **awilix 13.x, pinned in the root catalog**, depended on via `catalog:` by `jie-platform`, `jie-tui`, `jie-cli`, `mock-llm-backend`.

2. **Each module directory gets a `module.ts`** exporting one `registerXModule(container: AwilixContainer<XCradle>): void` that registers the module's implementations (`.singleton()`). Implementation classes are visible only to their unit tests and this registration — never re-exported from the module's `index.ts`, which carries the interface, cross-boundary types, and the register function. The `createX` / `makeX` closure factories are removed.

3. **Each package gets a `container.ts`** with its cradle fragment (every injectable name → type) and a boot function returning a **fresh** `AwilixContainer` per call: `bootPlatform(options: JiePlatformOptions): AwilixContainer<PlatformCradle>`, `bootTui(options, deps): AwilixContainer<TuiCradle>`. Consumers read `container.cradle.<name>`; test overrides are container registrations before first resolution.

4. **Constructor injection by parameter name** (CLASSIC mode). Cradle keys are camelCase interface names (`eventManager`, `settingsStore`, …); constructor parameters are named after the key they consume. Pure functions (reducers, `Events`, bash parsing, file scanning) are not registered — DI covers stateful/IO services.

5. **Per-call data is a factory cradle entry.** `AgentBody` is per-agent-per-session: `PlatformCradle.agentBodyFactory: (params) => AgentBody`, a closure over singleton deps registered in `core/module.ts`. The TUI's per-message components use the analogous `chatMessages` factory entry.

6. **Cross-package coupling stays at the interface.** `jie-tui` receives the resolved `JiePlatform` handle as an `asValue` registration; no cradle type crosses a package boundary (monorepo-structure.md boundary rule). `jie-cli` is the composition root: its `RunDeps` holds the boot functions; command handlers remain plain edge functions.

7. **The settingsStore ↔ teamManager cycle** resolves through a `teamLocator` cradle entry: a closure over the cradle proxy (`(teamId) => container.cradle.teamManager.locate(teamId)`) that defers resolution to call time.

## Rationale

- The closure-factory composition (`buildJiePlatformDeps`) hid the wiring inside the entry function and leaked implementation concerns into call sites; per-module registration makes each module's dependencies explicit and its implementation private, per the CLAUDE.md visibility rules.
- Unit tests construct classes directly with `vi.mocked` dependencies — no factory bundles, no container ceremony, no `(x as unknown as …)` seams into private closures.
- CLASSIC mode needs no decorators and keeps constructors plain; bun's native type-stripping preserves parameter names, verified by a smoke run on the pinned toolchain (beep runs the identical setup in production).
- Fresh containers per boot (not a module-global singleton as in beep's single-run app) because these packages are libraries: e2e boots many platform+TUI instances per process, and cached singletons would leak across tests.

## Consequences

- Public surface changes once: `jie-platform` exports `bootPlatform` + `PlatformCradle` in place of `createJiePlatform` + `JiePlatformDeps` (the deps bundle dies — overrides are container registrations); `jie-tui` exports `bootTui` + `TuiCradle` in place of `createTui`; `createGitService` leaves the public surface (the CLI reads the snapshot from `PlatformCradle.gitService`).
- Tool factories stay module-internal (`tools/MODULE.md`: tools register without external callers knowing them) — only the registry enters the cradle.
- Every sealed module `index.ts` gains exactly one export (`registerXModule`); gates are lifted per phase and re-sealed byte-identical after.
