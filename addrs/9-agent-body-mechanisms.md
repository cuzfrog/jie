# ADR 9: AgentBody Implementation Mechanisms

## Status

Accepted. Records implementation-level decisions for the `AgentBody` wrapper.

## Context

Several v1 implementation details for the `AgentBody` are not visible at the architectural level but must be specified to make the body implementable. This ADR groups them.

## Decisions

### 1. Tool `signal` combining (D7)

When adapting a Jie `Tool` into pi-agent's `AgentTool`, the `execute` function receives an optional `signal` from pi-agent. Jie combines it with the tool's timeout:

- If pi-agent provides a signal: `AbortSignal.any([piSignal, AbortSignal.timeout(tool.timeout ?? 120_000)])`. The tool aborts on either parent cancellation or timeout.
- If pi-agent signal is `undefined`: `AbortSignal.timeout(tool.timeout ?? 120_000)` alone.

Tools see a single combined signal — they don't know which trigger fired.

### 2. Streaming flush timer (D8)

`agent.stream.chunk` buffering uses `setTimeout`:

- On first `message_update` of a new stream, allocate a buffer, `stream_id`, and start a flush timer (`setTimeout(stream_flush_ms)`).
- Append delta text to the buffer.
- Flush when: buffer length ≥ `stream_chunk_size` (default 64 chars), or the flush timer fires. On flush, publish `agent.stream.chunk`, reset the buffer, and reset the timer.
- On `message_end`, clear the timer, flush remaining buffer, and publish `agent.stream.end`.

The timer fires at most once per flush window — no `setInterval` debouncing.

### 3. Self-receipt filtering (D9)

Filtering happens in `AgentBody`'s subscription callback, not in `EventBus.publish()`. When a callback receives an event, it checks if `payload.source === this.agent_key` and skips processing if so.

**Rationale:** the `EventBus` is transport-agnostic. A future `NatsEventBus` over a network would not have access to agent identities — putting filtering at the bus layer would leak agent concepts into the transport. At the `AgentBody` layer, filtering is application logic.

### 4. Notify recipient count (D3)

`EventBus` exposes `subscriberCount(subject): number`. The `notify` tool returns `{ ok: true, recipients: subscriberCount(topic) }`. For `InProcessEventBus`, this is `callbacksForSubject.size`. The `NatsEventBus` would implement it via NATS `num_subscribers` or equivalent.

## Consequences

- Tool implementations only need to honor a single `AbortSignal` — no need to track multiple sources.
- Streaming output is bounded by both char count and wall-clock time, ensuring responsive UI under both fast and slow LLM output.
- The `EventBus` interface stays narrow (3 methods: `publish`, `subscribe`, `subscriberCount`). Filtering and counting are concerns pushed to implementations.
