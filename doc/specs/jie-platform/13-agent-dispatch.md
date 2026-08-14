# Agent Dispatch and Work Coordination

Teams may define roles with `replica: N` (default 1, max 8), producing multiple `AgentBody` instances with stable `agentKey = {role}-{N}`. The platform supports two work coordination patterns for these replicas, each optimized for a different kind of work.

## Pattern 1: Fan-out with Atomic Kanban Claim

Use this pattern when work is pre-defined as claimable units (kanban cards) and replicas should self-coordinate without a platform router.

### How it works

1. All replicas subscribe to the same topic.
2. When triggered, each replica attempts to claim a card with `claim_kanban(content, expected_status?)`.
3. `KanbanStore.claim()` atomically checks that the card exists, is unassigned or already assigned to the calling agent, and (optionally) matches the expected status.
4. The first successful claimant sets the `assignee` to its `agentKey` and moves a `pending` card to `in_progress`.
5. Losers receive a "not claimable" result and do nothing.

### Contract

- `claim_kanban` must be listed in a role's `tools:` to be available; it is included in the jie-dev-team implementer and reviewer manifests.
- Claims are atomic at the storage layer.
- A replica can re-claim its own card (idempotent).
- A claim fails when the card is assigned to a different agent or the expected status does not match.
- The platform does not route fan-out work; all replicas receive the same trigger and the claim is the synchronization point.

## Pattern 2: Least-Busy Dispatch for Directed Role Work

Use this pattern when a caller delegates work to a role without knowing which replica should handle it.

### How it works

1. The caller invokes `call_agent({ agent: "<role>", prompt: "..." })`.
2. `AgentDispatcher.resolveTarget()` finds all loaded bodies for the role.
3. `AgentDispatcher.selectRoleReplica()` scores each replica and picks the least busy.
4. If all replicas are busy, the call is queued for the selected one and `ticket.queued` is `true`.

### Selection criteria

A replica is dispatchable when `canDispatchNow()` returns true: the body exists, no call is active, the agent is not running a turn, and its prompt queue is empty. `selectRoleReplica()` sorts replicas by:

1. Idle replicas first.
2. Among non-idle replicas, the one with the fewest pending queued calls.

Ties are broken by the original order in the `bodies` array, which is deterministic across team construction.

### Contract

- `call_agent` returns a `CallAgentTicket` with the selected `agentKey`.
- The same `agentKey` can be used for follow-up calls to the same replica.
- If no body is loaded but the ref is an installed shared agent, the dispatcher spawns an ad-hoc body.

## Choosing Between Patterns

| Factor | Fan-out (`claim_kanban`) | Dispatch (`call_agent`) |
|---|---|---|
| Work unit | Pre-defined kanban card | Arbitrary prompt |
| Coordination | Agent-side (atomic claim) | Platform-side (least-busy selection) |
| Trigger | All subscribed replicas receive it | One replica receives it |
| Load balancing | Self-coordinated | Least-busy queue |

## References

- ADR 41: Hybrid Routing Policy for Replicated Roles
- `06-agent-model.md` for `replica` semantics
- `04-storage.md` for `KanbanStore` persistence
