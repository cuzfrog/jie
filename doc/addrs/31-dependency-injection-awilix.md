# ADR 31: Dependency Injection via awilix

## Status

Accepted. All packages compose their services through awilix containers (`InjectionMode.CLASSIC`), following the pattern of `/home/cuz/workspace/beep/src/container.ts`..

## Decision

awilix pinned root; `catalog:` references historical.

2. **Each module directory gets a `module.ts`** exporting one `registerXModule(container: AwilixContainer<XCradle>): void` that registers the module's implementations (`.singleton()`). Implementation classes are visible only to their unit tests and this registration — never re-exported from the module's `index.ts`, which carries the interface, cross-boundary types, and the register function. The `createX` / `makeX` closure factories are removed.

3. **Each package gets a `container.ts`** with its cradle fragment (every injectable name → type) and a boot function returning a **fresh** `AwilixContainer` per call: `bootPlatform(options: JiePlatformOptions): AwilixContainer<PlatformCradle>`, `bootTui(options, deps): AwilixContainer<TuiCradle>`. Consumers read `container.cradle.<name>`; test overrides are container registrations before first resolution.

CLASSIC mode: parameter names match cradle keys.

Per-call data via factory cradle entries.

Cross-package coupling at interface only.

Cycle resolved via deferred `teamLocator` cradle entry.

## Rationale
Per-module registration makes dependencies explicit; fresh containers avoid singleton leaks.

## Consequences

- Public surface changes once: `jie-platform` exports `bootPlatform` + `PlatformCradle` in place of `createJiePlatform` + `JiePlatformDeps` (the deps bundle dies — overrides are container registrations); `jie-tui` exports `bootTui` + `TuiCradle` in place of `createTui`; `createGitService` leaves the public surface (the CLI reads the snapshot from `PlatformCradle.gitService`).
- Tool factories stay module-internal (`tools/MODULE.md`: tools register without external callers knowing them) — only the registry enters the cradle.
- Every sealed module `index.ts` gains exactly one export (`registerXModule`); gates are lifted per phase and re-sealed byte-identical after.
