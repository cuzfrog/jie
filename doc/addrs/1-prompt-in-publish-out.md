# ADR 1: Topic-Based Pub/Sub Agent Communication

## Status

Accepted (revised 2026-05-29).

## Context

Previous design had agents with no knowledge of the event bus, a leader-only `delegate` tool, and `session.*.>` subscriptions for tracking pipeline progress. This created coupling between the leader and worker agents and required special injection mechanisms for session events to re-enter the leader's LLM loop.

## Decision

Agents communicate exclusively through topic-based pub/sub on the EventBus. The model:

- **Every agent auto-subscribes to its `{agent_key}`** at startup — this is the direct-addressing channel.
- **The leader additionally auto-subscribes to `leader.prompt`** — user prompt ingress from TUI/CLI.
- **Domain topic subscriptions** are declared in the agent's `.md` frontmatter `subscribe:` field (e.g. `task.recorded`, `task.researched`).
- **`notify(topic, prompt)`** (all agents) publishes to `{topic}` on the EventBus with the prompt string. The publishing agent's `AgentBody` filters its own receipts by `envelope.sender.identity.agentKey === agent_key` (see `06-agent-model.md` "Built-in Tool: `notify`" step 3); the bus itself does not filter. `notify` does not end the LLM's turn.
- Pipeline order is encoded in the subscription graph — each agent subscribes to the previous agent's topic.

## Consequences

- No `delegate` tool. No `session_id`. No `agent.{role}.prompt` subjects.
- Agent keys double as direct-addressing topics. Domain topics for pipeline progression.
- The platform is agnostic of topic semantics — agents subscribe to strings; the team blueprint defines the topic namespace and subscription graph.
- The leader has no special tools or subscriptions beyond `leader.prompt` auto-sub. Uses `notify` like any other agent.
- Agents can be tested in isolation: publish a message to their subscribed topic, observe the `notify` output.
- The subscription graph provides natural pipeline serialization.
