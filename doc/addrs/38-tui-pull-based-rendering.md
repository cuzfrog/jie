# ADR 38: TUI Uses Pull-Based Rendering via `TuiComponent.update()`

## Status

Accepted (2026-08). Evolves ADR 25 (event-driven TUI) and ADR 30 (pi-tui migration) on the render mechanism. ADR 25's event-driven state derivation is unchanged; this addresses how derived state reaches the screen.

## Context

Each TUI component subscribes to `stateStore` and calls `screen.requestRender()` on change (push, scattered). This couples every component to `screen` and to the subscription mechanism, scatters the render-trigger logic, and leaves orphan components (`chatSync`) that no real consumer reads - resolved only as a side effect of `start()`/`stop()`. The render request is explicit per component on each event, with no central dirty check, so redundant renders and duplicate subscriptions accumulate.

## Decision

Pull-based rendering.

- Introduce `TuiComponent extends pi-tui `Component`, adding `update(): boolean`. `update()` reconciles the component (and its subtree) to current state - reading `stateStore` - and returns whether it is dirty (would produce different output). It is impure but runs before the render traversal, so tree mutation is safe.
- `render(width)` stays pure (pi-tui contract): it produces lines from already-reconciled state. Reconcile and render are separated.
- A `TuiRenderer` holds the single `stateStore.subscribe`. On event it calls `root.update()` and renders (`screen.requestRender()`) only if dirty. Components never touch `screen`, `requestRender`, or `subscribe`.
- The aggregation root is jie-owned (pi-tui's `Container` does not aggregate `update()`); the view, which already holds every jie component, is the root.

## Rationale

Centralizes the render decision and the single subscription; decouples components from the render infrastructure; separates reconcile (impure, pre-render) from render (pure); resolves orphan components (`chatSync` becomes a rendered `TuiComponent` consumed by the view); skips renders when nothing changed. `update()` is trigger-agnostic - state events or animation ticks both call it; state-driven components return `false` on a tick.

## Consequences

- `start()` becomes vestigial (no per-component subscribe); `stop()` reduces to non-subscription teardown (Loaders, timers). The renderer's subscription dies with `stateStore.stop()`.
- Animation (spinner frames, title dots) is not state-driven; it needs a separate timer trigger that also calls `root.update()`. This folds in when `thinkingTicker`/`transientAger` are tackled.
- pi-tui's `Component` has no `update()`; jie owns the aggregation root.
- `chatSync` folds into the chat `TuiComponent`; it is no longer an orphan kept alive by `start()`/`stop()`.
