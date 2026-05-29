# ADR 2: NATS Core Pub/Sub — No JetStream

## Status

Accepted.

## Context

Previous design used NATS JetStream for durable domain events, enabling agent restart replay. The stated rationale was recovery: a restarted agent replays its last unacknowledged event via JetStream durable subscription.

## Decision

v1 uses NATS core pub/sub only. All events are ephemeral. No JetStream streams, consumers, or replay logic.

## Rationale

JetStream replay does not actually recover a serial pipeline. When one agent crashes, its upstream agent has already moved on — it won't re-fire the event. The restarting agent replays an event into a dead pipeline. Genuine mid-work-unit recovery requires the leader to re-discover and re-drive the work, not replay a single event.

Operational cost of JetStream: `-js` flag, stream config, consumer ack management, persistent or in-memory store decisions. All for a recovery mechanism that doesn't work for the pipeline topology.

## Consequences

- `nats-server` runs without `-js`. Simpler setup, no stream management.
- Agent restart = clean restart. The supervisor restarts the agent, the leader re-discovers in-flight work units from the artifact store and re-delegates.
- `EventBus` interface is two methods: `publish(subject, payload)`, `subscribe(subject, callback)`.
- Durable event history for post-mortem analysis is deferred.
