# ADR 6: No Turn Budgets, No Grace Turn — Trust the LLM

## Status

Accepted. Subsumes ADR 8 (No Grace Turn).

## Context

The early design guarded against runaway LLM loops with platform-level machinery: `error_turn_budget` / `total_turn_budget` counters, and (after the budgets were dropped) a grace turn — a system reminder when the LLM ended a response without calling `notify`, escalating to a force-emitted `notify(error = "missing_emission")`. Both are defensive scaffolding that second-guess the LLM's own judgment about when it is stuck or done.

## Decision

The agent loop is entirely pi-agent-core's responsibility. The platform has no turn counters and no grace turn:

- When the LLM returns `stopReason` (`"stop"`, `"length"`, `"error"`, `"aborted"`), the loop exits and the body publishes `agent.idle`.
- `notify` is a regular inter-agent notification tool. The LLM calls it when its system prompt instructs it to; it is not a loop-control signal.
- `ToolResult.terminate`, when a Jie tool returns it, is handled natively by pi-agent (stop the batch, exit the inner loop). The platform does not interpret it.

## Rationale

- **The LLM knows best when it is stuck.** If a tool repeatedly fails, the LLM is better equipped than a counter to try a different approach, ask for help, or signal failure via `notify`.
- **`stopReason` is the standard termination signal.** pi-agent already handles the four termination conditions correctly; a Jie-layer termination path on top is redundant.
- **Scaffolding for a rare case.** The grace turn bought state tracking, two-step escalation, and synthetic message injection to cover "the LLM forgot its system prompt" — which rarely happens with capable models.
- **A genuinely broken LLM could consume API credits indefinitely.** Acceptable trade-off; if it becomes a problem, the fix is an external watchdog or optional per-deployment limits, not a default hard budget.

## Consequences

- `AgentBody` has no budget fields, no grace counter, no steering-message injection, no force-emit path; its turn-end handling is bookkeeping only (memory persistence, telemetry).
- If turn limits are ever needed (cost control, safety), they land as optional configuration or an external watchdog without changing the default model.
