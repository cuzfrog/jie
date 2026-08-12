# ADR 6: No Turn Budgets, No Grace Turn — Trust the LLM

## Status

Accepted. Subsumes ADR 8 (No Grace Turn).

## Context

The early design guarded against runaway LLM loops with platform-level machinery: `error_turn_budget` / `total_turn_budget` counters, and (after the budgets were dropped) a grace turn — a system reminder when the LLM ended a response without calling `notify`, escalating to a force-emitted `notify(error = "missing_emission")`. Defensive scaffolding that second-guesses the LLM.

## Decision

The agent loop is entirely pi-agent-core's responsibility. The platform has no turn counters and no grace turn:

- When the LLM returns `stopReason` (`"stop"`, `"length"`, `"error"`, `"aborted"`), the loop exits and the body publishes `agent.idle`.
- `notify` is a regular inter-agent notification tool. The LLM calls it when its system prompt instructs it to; it is not a loop-control signal.
- `ToolResult.terminate`, when a Jie tool returns it, is handled natively by pi-agent (stop the batch, exit the inner loop). The platform does not interpret it.

## Rationale
LLM knows best when stuck; `stopReason` is standard. Turn limits (if needed) are optional/config or external watchdog.

## Consequences

- No budget/grace fields in `AgentBody`. Optional limits via external config/watchdog.
