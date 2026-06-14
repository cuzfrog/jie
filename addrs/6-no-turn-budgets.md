# ADR 6: No Hard Turn Budgets — LLM Self-Termination

## Status

Accepted.

## Context

`05-agent-model.md` defined two hard turn budgets per agent body:

- `error_turn_budget` (default 30): Decremented on turns with tool-result errors. Exhaustion → terminal event with `error = "error_budget_exhausted"`.
- `total_turn_budget` (default 200): Decremented on every LLM turn unconditionally. Exhaustion → terminal event with `error = "turn_budget_exhausted"`.

These budgets were safety nets against runaway LLM loops. However, they introduce platform-level logic that second-guesses the LLM's own reasoning about when it is stuck or done.

## Decision

Remove both `error_turn_budget` and `total_turn_budget`. The LLM is responsible for self-termination via the `notify` tool. The platform provides a single enforcement mechanism: the grace turn.

## Rationale

- **The LLM knows best when it's stuck.** If a tool repeatedly fails, the LLM is better equipped than a counter to decide whether to try a different approach, ask for help, or signal failure via `notify`.
- **`notify` is the natural termination mechanism.** Every agent loop already terminates on a successful `notify` call. Adding hard budgets creates a second termination path that can cut off productive work.
- **Grace turn is sufficient.** If the LLM forgets to call `notify`, it gets one reminder. If it still cannot emit, the body force-publishes `"missing_emission"`. This covers the "LLM lost track" case without imposing arbitrary turn limits.
- **Simplifies the agent body.** Two fewer fields, two fewer termination branches, no budget-related error types.

## Consequences

- Agent loops run until the LLM calls `notify` or the grace turn fires. No bounded maximum turn count.
- A genuinely broken LLM (hallucinating, looping) could consume API credits indefinitely. In practice, the grace turn catches "forgot to notify" cases, and genuinely pathological loops are rare with capable models.
- If turn limits are needed for specific deployments (cost control, safety), they can be reintroduced as optional configuration without changing the default model.
