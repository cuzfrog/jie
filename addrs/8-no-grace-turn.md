# ADR 8: No Grace Turn — Trust the LLM

## Status

Accepted. Revises ADR 6.

## Context

ADR 6 removed hard turn budgets but kept a grace turn mechanism: if the LLM ended a response without calling `notify`, the body would send one system reminder, then force-emit `notify(error = "missing_emission")` on a second miss.

In practice, this was defensive scaffolding against an LLM not following its system prompt. With modern capable models, this scaffolding is unnecessary complexity. pi-agent's loop already terminates based on the LLM's `stopReason` (`"stop"`, `"length"`, `"error"`, `"aborted"`) — there is no need for Jie to second-guess termination.

## Decision

v1 has no grace turn. The agent loop is entirely pi-agent's responsibility. When the LLM returns `stopReason: "stop"`, the loop exits and the body publishes `agent.idle`. `notify` is a regular tool — the LLM calls it when the system prompt instructs it to, not as a loop-control signal.

## Rationale

- **Trust the LLM.** A capable LLM follows its system prompt. Forcing a "you must call `notify`" reminder path introduces complexity (state tracking, two-step escalation, synthetic message injection) for a case that rarely occurs in practice.
- **pi-agent's loop is sufficient.** `stopReason` is the standard signal in OpenAI/Anthropic APIs. pi-agent already handles the four termination conditions correctly. Adding a Jie-layer termination on top is redundant.
- **`ToolResult.terminate` is not a loop-control lever in v1.** If a Jie tool returns `terminate: true`, pi-agent handles it natively (stops the tool batch and exits the inner loop). Jie does not interpret `terminate` as a platform-level signal.

## Consequences

- No grace counter, no steering-message injection, no force-emit path in `AgentBody`.
- The `turn_end` event handler does only bookkeeping (memory persistence, telemetry) — no termination logic.
- ADR 6's "Grace turn is sufficient" rationale is superseded. ADR 6's main decision (no hard turn budgets) still stands.
- A genuinely broken LLM could consume API credits indefinitely. Acceptable trade-off for v1; if it becomes a problem, revisit with an external watchdog (not a hard platform budget).
