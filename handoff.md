# Handoff

## Next

No pending work. All changes committed (`a894f15`) and `bun test` is green (329/329 across 32 files).

## Your role

Resume on `dev_stage1_improve` if you want to revisit any of the surface reduction decisions below.

### Notes on the surface reduction

The package barrel now exports only:
- `startJie`, `JieHandle`
- `AgentEvent`, `TeamBlueprint`
- `SqliteStorage`
- `loadMergedSettings`, `loadAuthJson`, `resolveStaleDefaultTeam`, `ModelRegistry`, `MergedSettings`, `AuthJson`
- `findProjectJieRoot`, `homeJieDir`, `globalAuthPath`, `globalSettingsPath`, `projectSettingsPath`
- `toolRegistry` (singleton), `Tool`, `ToolResult`, `ToolRegistry`, `ExecutionContext`

Things deliberately hidden behind that boundary:
- All `create*Tool` factories and their `*Deps` types (per the prior `tools/` reduction).
- The `InMemoryToolRegistry` class and the `createToolRegistry` factory — these are accessible only from `tool-registry.ts` inside the package, not via `tools/index.ts`.
- `AgentBody`, `InProcessEventBus`, `EventBus`, `EventCallback`, all streaming helpers, `StartJieOptions`, raw config types, team internals (`AgentSoul`, `ToolSpec`, `loadMinimalTeam`, etc.).
- Dead re-exports at the bottom of `start.ts` were also removed.

### Two design tensions worth knowing

1. **`tests/e2e/event-order.test.ts` now uses the shared `toolRegistry` singleton** instead of `new InMemoryToolRegistry()`. The class is hidden by design, and the factory is not re-exported from `tools/index.ts` (the submodule's barrel is `frozen`). The test works because every test registers the same `"noop"` tool (last-writer-wins). If a future e2e test needs a fresh registry, either expose `createToolRegistry` via `tools/index.ts` (changes the frozen submodule) or extend `ToolRegistry` with a `clear()` method (changes the interface and every impl).

2. **Subpath exports added**: `package.json` now exposes `./core`, `./team`, `./tools` in addition to `./storage`. These exist solely so `tests/e2e/event-order.test.ts` can reach internal types via submodule index.ts without bypassing the index. They grow the package surface slightly; remove them if you find a way to keep the e2e test within the public barrel.

### Verification

```
$ cd packages/jie-platform && bun test   # 226 pass, 0 fail
$ cd packages/jie-cli && bun test       #  94 pass, 0 fail
$ bun test                              # 329 pass, 0 fail
$ bunx tsc --noEmit                     # clean
```