# ADR 41: Hybrid Routing Policy for Replicated Roles

## Status

Accepted.

## Context

A role can declare `replica: N` (default 1, max 8), producing multiple `AgentBody` instances with stable `agentKey = {role}-{N}`. Two work patterns emerged for these replicas:

1. **Claimable work** (kanban-based). Replicas coordinate through shared state. All replicas see the same trigger (via `subscribe`) and race to claim a card with `claim_kanban`. Only one wins; losers receive a clear "not claimable" result and do nothing.
2. **Directed role work** (`call_agent`-based). A caller asks the platform to route a prompt to a role without naming a specific replica. The platform must pick one replica.

A single routing strategy cannot serve both patterns. Fan-out requires every replica to receive the trigger, while directed calls require the platform to choose a single target.

## Decision

Adopt a hybrid routing policy:

- **Fan-out for claimable work.** Replicas self-coordinate through the kanban board and atomic `claim_kanban` claims. The platform fans out the trigger (all subscribed replicas receive the event) and the first successful claim wins the card. No platform-level router is involved; the atomic claim in `KanbanStore.claim()` is the synchronization point.
- **Least-busy dispatch for directed role work.** When `call_agent` targets a role name, `AgentDispatcher.resolveTarget()` enumerates the role's bodies and `selectRoleReplica()` picks the replica most likely to accept the call immediately: idle replicas are preferred over busy ones, and among non-idle replicas the one with the shortest pending-call queue is chosen.

The call site chooses the pattern:

- Use `notify` + `claim_kanban` for claimable work.
- Use `call_agent({ agent: "<role>", prompt: "..." })` for directed work.

## Consequences

- Team authors select the pattern that matches their workflow; the two patterns are not interchangeable.
- `AgentDispatcher.selectRoleReplica()` owns the least-busy selection logic for directed calls.
- `KanbanStore.claim()` owns the atomic coordination point for fan-out work.
- The platform never routes fan-out work; routing is reduced to event fan-out plus storage-level atomic claim.
