# ADR 42: TUI thinking duration uses whole-second granularity

## Status

Accepted (2026-08).

## Context

The `AssistantMessage` work summary renders a live `Thinking... (Nms)` line while a thinking block is streaming. Because the live elapsed time starts at zero and ticks up in small increments, the label spends the first second as `Thinking... (0ms)`, then `Thinking... (80ms)`, etc. This millisecond noise makes the counter look stuck or broken. The completed `Thought for ...` line and tool-card durations were not reported as a problem.

## Decision

Live `Thinking...` duration is displayed at whole-second granularity, floored to the nearest second. The first 999ms render as `Thinking... (0s)`, then `Thinking... (1s)` for the next whole second, and so on.

- `formatDuration` keeps its existing behavior (milliseconds for sub-second, rounded seconds and `m s` for longer durations) for completed `Thought for ...` and tool-card durations.
- `formatDurationAsSeconds` is introduced for the live `Thinking...` summary and uses `Math.floor(ms / 1000)` to produce whole seconds.

## Rationale

The user-visible unit for an in-progress reasoning step should be seconds, not milliseconds. Flooring makes the counter advance only when a full second has elapsed, matching how a human would read "thinking for 1 second". Millisecond precision is still appropriate for tool-call durations and completed thinking blocks, so those stay on `formatDuration`.

## Consequences

- The live summary no longer flickers through low millisecond values.
- Completed `Thought for ...` and tool-card summaries remain unchanged.
- A new formatting function is added to the chat component module; the distinction is documented here so callers choose the right one.
