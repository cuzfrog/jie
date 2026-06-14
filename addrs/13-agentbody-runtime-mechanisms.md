# ADR 13: AgentBody Runtime Mechanisms

## Status

Accepted. Closes Group J (implementation-grade gaps surfaced 2026-06-07).

## Context

After Groups A–H closed, a fresh implementer pass identified seven implementation-grade gaps that would block writing working code. Three of them are **architectural** — they describe how the `AgentBody` wrapper mediates between pi-agent and Jie's EventBus. The other four (J1, J2, J5, J7) are tool/TUI spec clarifications and live in the spec prose, not here.

The three architectural items:

- **J3** — `EventBus.publish` had no documented error-propagation policy. A throwing subscriber would propagate up into the publishing agent's tool call.
- **J4** — The event bus payload declared `tool_call_id` as a `uint32` counter maintained by the body, with a `Map<pi_toolCallId, uint32>` for correlation. The prior-session pick added state and indirection without a clear consumer need.
- **J6** — `agent.idle` was published only on `agent_end`. A never-prompted agent at startup published nothing, leaving the TUI agents-panel empty.

## Decisions

### 1. EventBus error containment (J3)

`publish(subject, payload)` catches per-callback exceptions, dispatches remaining subscribers in order, never throws to the publisher. Each caught error logs to stderr with subject, callback index, and error message.

- `subscriberCount(subject)` continues to return the **registered** count — it is the "how many are listening" contract, not "how many succeeded".
- `notify` returns the registered count to the LLM. The LLM needs to know "is anyone listening?", not "did every callback run cleanly". Subscriber errors are operator-visible via the stderr log.
- The in-process impl enforces this; the future `NatsEventBus` impl reuses the same interface. Reliability concerns (NATS retries, durable delivery) are Day 2 (backlog #17) and not in scope for v1.

### 2. `tool_call_id` is a passthrough (J4)

The body does not synthesize a `tool_call_id`. The event bus payload carries pi-agent's string `ctx.toolCallId` directly.

- Both `agent.tool.call` and `agent.tool.result` events for the same tool call carry the same string — the natural correlation key.
- The body holds **no state** for tool IDs. The string flows through the `beforeToolCall` / `afterToolCall` hook contexts unchanged.
- The value is opaque to Jie and to consumers. Provider-defined (OpenAI: `call_xxx`, Anthropic: `toolu_xxx`). Format is not Jie's concern.
- This supersedes the prior session's `Map<pi_toolCallId, uint32>` design, which added a counter + Map + lifecycle for no clear consumer benefit. The string works for the only consumer need (correlation), and pi-agent's `pendingToolCalls: Set<string>` is precedent that the string is sufficient.

### 3. Initial `agent.idle` at startup (J6) — **REVERSED 2026-06-14 by ADR 24**

`AgentBody.start()` no longer publishes `agent.idle`. A body that has not yet processed any turn is idle by definition; the startup publish was redundant. The TUI's agents-panel-at-boot story moves to the new `{team_id}.team.loaded` event (see ADR 24 §2), published by the `JieHandle` once per team load. The body still publishes `agent.idle` on every `agent_end` (the busy→idle transition).

The original J6 decision is preserved here for historical reference:

> `AgentBody.start()` publishes `agent.idle` exactly once after subscriptions are registered, before the body begins processing the message queue. The same subject and payload are used; the distinction (startup vs run-end) is implicit in lifecycle position.
>
> - Subscriptions register first (`{agent_key}` plus `leader.prompt` for the leader, plus `soul.subscriptions`).
> - Then the body publishes `agent.idle` to advertise "exists, currently idle" to observers.
> - Then the body begins processing the message queue.
> - The ordering matters: publishing before subscriptions would let observers see the agent before it was wired to receive; publishing after the loop begins would let a hypothetical first event sneak ahead of the idle signal.
>
> The TUI uses this signal — combined with the `roles: string[]` parameter (see J7) — to render the agents-panel at boot. Per `08-memory.md` and the J7 decision, the TUI gets the role list from the supervisor (which loaded the blueprint); the per-body `agent.idle` provides the live state.

**Rationale for the reversal** (per ADR 24): "Default state is idle; events announce transitions." Publishing `agent.idle` at startup conflated two distinct signals ("this agent exists, currently idle" vs "this agent transitioned busy→idle"). Removing the startup publish eliminates a class of "what does the startup event mean?" ambiguity. The TUI's boot story is preserved by `team.loaded` (different event, different semantic). The `JieHandle` is the single source of "is the team loaded?", not the per-body `agent.idle`.

## Rationale

- **Passthrough is the boring answer.** pi-agent already uses the LLM-provided `toolCallId` everywhere internally. Adding a Jie-side counter was speculative future-proofing; the LLM-generated string is unique per call, opaque, and free.
- **Error containment is the agent's armor.** A misbehaving TUI render path or diagnostic subscriber must not crash an in-flight LLM agent. Catching per-callback is the standard, simple defense.
- **Boot-time idle is the TUI's anchor.** The TUI has a panel that must populate at boot. Without the startup publish, never-prompted agents are invisible (no event ever fires for them). With it, the panel is a true reflection of the team.

## Consequences

- `packages/jie-platform/core/event-bus.ts` (in-process impl): `publish` wraps each callback in `try { callback(...) } catch (err) { console.error(...) }`.
- `packages/jie-platform/core/agent-body.ts`: `start()` runs the new sequence (subscribe → publish `agent.idle` → start loop). `beforeToolCall` / `afterToolCall` hooks read `ctx.toolCallId` directly — no local counter, no Map.
- `03-event-system.md` "Agent Idle" section: extend the rule from "on every `agent_end`" to "at startup AND on every `agent_end`". Payload type for `agent.tool.*` events: `tool_call_id: string` (not `number`).
- `06-agent-model.md`: `AgentBody` class signature's `start()` comment is updated; "Tool Telemetry" section drops the counter paragraph; `BashResult` / `notify` / `write_file` spec notes captured in the same file (J1, J2, J5) reflect their decisions.
- `ui/tui.md` Contract: `roles: string[]` is required; sourced from `.md` filename stems (alphabetical), not `TEAM.md`. Used for initial agents-panel render.
- TUI agents-panel at boot: populated from `roles` + the per-body startup `agent.idle` (the **original J6 design**, since reversed by ADR 24). Under the new design, the agents-panel is populated from `{team_id}.team.loaded` for each loaded team, published by the `JieHandle` (per ADR 24). Never-prompted agents are visible from the start.
- The prior session's `Map<pi_toolCallId, uint32>` design is **superseded** and removed from any tracker or ADR.
