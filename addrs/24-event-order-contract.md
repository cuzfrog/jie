# ADR 24: Event-Order Contract; Drop Startup `agent.idle`; New `team.loaded` Event; CLI Owns the Idle Gate

## Status

Accepted 2026-06-14. Reverses ADR 13 §3 (J6) for the `agent.idle` startup publish. Captures four interrelated decisions that stem from one principle: the platform is event-driven; consumers compose their own wait logic; the handle is not the owner of "is the work done?".

## Context

After Pass 4 (ADRs 22, 23), Pass 5 (`onUpdate` plumbing, `JieHandle.swapTeam` removal, etc.), Pass 6, and Pass 7 (5 spec-precision fixes), the platform's lifecycle and event surface were stable. The fresh review pass on 2026-06-14 surfaced four intertwined items:

1. **The body publishes `agent.idle` at startup** (per ADR 13 §3 — J6). This was the TUI's agents-panel-at-boot anchor. But it conflates two distinct signals: "this agent exists, currently idle" (startup) and "this agent transitioned busy→idle" (end of turn). An agent that has not yet processed any turn is, by definition, idle — no event is needed to advertise that.

2. **No event announces a team's roster.** The TUI derives "agent is alive" from `agent.idle` at startup. With the startup publish removed, the TUI loses its anchor. A clean announcement event is needed.

3. **`JieHandle.waitForIdle` is the CLI's "is the work done?" primitive.** This couples the handle to the `-p` mode's specific concern. The TUI does not need a "wait for idle" method (it consumes events and runs continuously); only the CLI needs the gate. The wait logic belongs in the CLI, not the handle.

4. **The `waitForIdle` semantic at startup is ambiguous.** The body publishes `agent.idle` at startup. The CLI's `waitForIdle(timeout)` is called right after the prompt is published. A naive implementation that reads "wait for all bodies to be in the idle state" would resolve on the next microtask (every body is idle from startup) and exit 0 before the leader has done any work. The spec was implicit that startup `agent.idle` events are "consumed but do not trigger the resolution", but this was not stated. An implementer could miss it and produce a broken `-p` mode.

The four items resolve together. This ADR groups them.

## Decision

### 1. Body's `start()` no longer publishes `agent.idle`

The body publishes `agent.idle` only on `agent_end`. A body that has not yet processed any turn has published no events; observers treat it as **idle by default**. This **reverses ADR 13 §3 (J6)**.

The boot signal moves to the new `team.loaded` event (Decision 2). The TUI's agents-panel-at-boot story is preserved by the new event, not by per-body `agent.idle`.

### 2. New event `{team_id}.team.loaded`

| Property | Value |
|---|---|
| Subject | `{team_id}.team.loaded` |
| Payload | `{ team_id, agents: { role: string, agent_key: string }[] }` (sorted alphabetically by role, consistent with the loader's `roles` output) |
| Publisher | The `JieHandle` — in `startJie` (for the startup team) and in `loadTeam` (for each subsequently-loaded team) |
| Timing | Once per team load, after all bodies' `start()` returns |
| Repetition | One-shot per team load. Not republished on team swap-back. The team is already loaded; observers that came back to it use the buffer / cache they already built up. |
| Envelope | Plain payload (not the `AgentEvent` envelope). The TUI processes the `team_id` and `agents` fields directly. |

### 3. `JieHandle.waitForIdle` is removed. CLI owns the idle gate.

The `JieHandle` interface drops the `waitForIdle` method. `StartJieOptions.onIdle` is also removed — the TUI does not need a callback; it consumes events directly.

`JieHandle` is reduced to lifecycle and introspection: `bus`, `artifacts`, `bodies`, `bodiesFor`, `rolesFor`, `loadTeam`, `stop`. The handle still owns the internal "bodies settled" bookkeeping needed for `stop()`'s graceful shutdown (send abort, wait for bodies to exit), but does not expose it.

The CLI's `-p` mode is the only consumer of an "is the work done?" primitive. It owns this composition:

```typescript
// CLI-side, in -p mode, after startJie() returns:
let resolveGate: () => void;
let timer: ReturnType<typeof setTimeout> | undefined;
const gate = new Promise<void>((resolve, reject) => {
  resolveGate = resolve;
  timer = setTimeout(() => reject(new Error('timeout')), timeoutMs * 1000);
});

const state = new Map<agentKey, 'busy' | 'idle'>();
const loadedAgentKeys = handle.bodies().map(b => b.agent_key);
for (const k of loadedAgentKeys) state.set(k, 'idle');

const evaluate = () => {
  if ([...state.values()].every(v => v === 'idle')) {
    clearTimeout(timer);
    resolveGate();
  }
};

handle.bus.subscribe('agent.turn.start', (_subj, env) => {
  if (state.has(env.agent_key)) state.set(env.agent_key, 'busy');
});
handle.bus.subscribe('agent.idle', (_subj, env) => {
  if (state.has(env.agent_key)) {
    state.set(env.agent_key, 'idle');
    evaluate();
  }
});

// Publish the prompt.
handle.bus.publish(`${teamId}.leader.prompt`, { prompt: instruction });

// Wait for the gate (or timeout).
await gate.catch(/* timeout handler */);
printFinalNewline();
handle.stop();
exit(0);
```

The gate is initialized with all bodies in the "idle" state. The gate opens when "for all loaded bodies, the state is `idle`". On gate open: print final newline, `handle.stop()`, exit 0. On timeout: `handle.stop()`, exit 3.

The `seenBusy` boolean is **not** used. The gate relies on the Event-Order Contract (Decision 4) to guarantee that no body can transition directly from "no event seen" to "`idle`" without first being observed as "busy" (because every `idle` is preceded by a `turn_start` for the same turn).

### 4. Event-Order Contract

Two pieces, both load-bearing for observer-side state machines (the CLI's `-p` idle gate, the TUI's busy/idle derivation).

**Body-side alternation.** For each body, the platform events `agent.turn.start` and `agent.idle` follow a strict alternation:

- A body that has not yet started any turn has published no events; observers treat it as idle by default (no event required).
- On every pi-agent `turn_start`, the body publishes exactly one `agent.turn.start`.
- On every pi-agent `agent_end`, the body publishes exactly one `agent.idle`.
- For the same turn, `agent.turn.start` is always published before the corresponding `agent.idle`. The body never publishes `agent.idle` without a preceding `agent.turn.start` for the same turn.
- Across turns: `turn_start` → `idle` → `turn_start` → `idle` → ...

**Bus-side in-order delivery.**

- v1 (`InProcessEventBus`): events are dispatched to subscribers synchronously in publish order. Per-body event order is preserved end-to-end. This is the v1 guarantee.
- Day-2 NATS: NATS preserves order per subject but not across subjects. `agent.turn.start` and `agent.idle` are different subjects; cross-subject reordering is possible. The Day-2 fix is a per-body monotonic `seq` stamped on every event the body publishes; observers discard updates whose `seq` ≤ last-seen for that body. See `backlog.md`.

### 5. CLI's `-p` idle gate: option B (no `seenBusy`)

The CLI's gate is the local state machine in Decision 3. The `seenBusy` boolean is dropped because the body-side alternation (Decision 4) makes it redundant: every `idle` implies a `turn_start` happened, so a body cannot transition from "no event seen" to "`idle`" without being observed as "busy" first.

The event-order contract is what makes option B correct. The contract is recorded normatively in `03-event-system.md` "Event-Order Contract" and operationally in `06-agent-model.md`.

## Rationale

- **The platform is event-driven; consumers compose.** The `JieHandle` is a lifecycle object, not a "is the work done?" service. The TUI does not need `waitForIdle` (it runs continuously with the runtime and consumes events). The CLI is the only one-shot consumer and owns its own wait. This matches the principle in `addrs/15-platform-entry-function.md`: the handle owns lifecycle; consumers compose primitives.

- **Default state is idle; events announce transitions.** Publishing `agent.idle` at startup is redundant — the body has not yet processed any turn, so it is idle by definition. Removing the startup publish eliminates a class of "what does the startup event mean?" ambiguity. The TUI's agents-panel-at-boot story is preserved by the new `team.loaded` event, which has a clean, distinct semantic: "these agents are now part of the team".

- **Two events, two semantics.** `team.loaded` is a one-shot team-routing announcement (the team's roster). `agent.idle` is a per-body state-transition event. They are not the same thing; the previous design conflated them.

- **The Event-Order Contract is what makes the gate correct.** The CLI's gate is initialized with all bodies in "idle" and waits for "all bodies' last observed event is `idle`". A naive reading of this gate (without the alternation guarantee) would say "a body that has never been observed as busy can still satisfy the gate" — which is true, but the alternation makes this moot. Every `idle` is preceded by a `turn_start`, so the body moves through `busy` first. The state machine is correct.

- **The bus's in-order delivery is the v1 guarantee.** The `InProcessEventBus` dispatches synchronously in publish order. The per-body `seq` is a Day-2 concern for NATS, not a v1 implementation detail. Recording it as a Day-2 backlog item (not a v1 ADR-grade change) is the right call.

- **The contract is recorded in two places, not one.** The ADR explains *why* the contract exists and the decisions that depend on it. The spec doc (`03-event-system.md`) is the normative source for the contract itself. This matches the pattern of ADR 15 + `09-deployment.md` Startup Sequence: the ADR is the decision; the spec is the procedure.

## Consequences

- `addrs/13-agentbody-runtime-mechanisms.md` — J6 reversed. Body's `start()` no longer publishes `agent.idle`. Amendment note added.
- `addrs/15-platform-entry-function.md` — `JieHandle` interface drops `waitForIdle`. `StartJieOptions` drops `onIdle`. Handle publishes `{team_id}.team.loaded` in `startJie` (after all `body.start()`) and in `loadTeam`. Amendment history updated.
- `addrs/21-multi-team-coexistence.md` — `team.loaded` is one-shot per `loadTeam`; not republished on swap-back. The previously-active team is not stopped; the new team's `team.loaded` fires for the new team only.
- `03-event-system.md` — Subject Schema: add `{team_id}.team.loaded`; tighten `agent.idle` row. "Agent Idle" section: rewrite (no startup `agent.idle`; boot signal is `team.loaded`). New section "Event-Order Contract" with both pieces and the Day-2 NATS note.
- `06-agent-model.md` — `AgentBody.start()` ordering drops the `agent.idle` publish. "Event Bridging" notes the alternation under `turn_start` and `agent_end` rows.
- `09-deployment.md` — Startup Sequence step 8/9: handle publishes `team.loaded` after all `body.start()` calls. "Graceful Shutdown" notes that `stop()` is the only lifecycle primitive with internal "bodies settled" bookkeeping; the CLI does not consume it.
- `ui/cli.md` `jie -p` — step 7 rewrite with the local idle gate snippet; cites the Event-Order Contract.
- `ui/tui.md` — "Agent Discovery" sources the agents-panel from `{team_id}.team.loaded` for each loaded team. "Degraded States" notes the new source. Other sections unchanged.
- `11-monitoring.md` — "Agent Status" table rewrite: alive = `team.loaded`; busy = `turn_start` (or recent stream/tool activity); idle = default + no `turn_start` observed yet, or `agent.idle` with no subsequent `turn_start`.
- `backlog.md` — new item: "Day-2 NATS per-body `seq` for cross-subject reorder protection".
- All cross-references to "the body publishes `agent.idle` at startup" are removed. The TUI's agents-panel-at-boot story moves to `team.loaded`.

## References

- Reverses ADR 13 §3 (J6).
- Modifies ADR 15 (handle interface) and ADR 21 (multi-team coexistence).
- Cited by `03-event-system.md` (normative), `06-agent-model.md` (operational), `ui/cli.md` (consumer), `ui/tui.md` (consumer), `09-deployment.md` (deployment), `11-monitoring.md` (monitoring).
- Closes the fresh review pass on 2026-06-14: critical gap (`waitForIdle` semantics at startup), `team.loaded` event, event-order contract, `waitForIdle` removed from handle. Eight smaller spec-precision gaps (loadTeam pre-check, web_fetch binary, read_file offset, --api-key position, file modes, TUI roles timing, queue-pickup flicker, artifacts.db corruption) folded in the same pass.
