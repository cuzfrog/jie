# ADR 1: Topic-Based Pub/Sub Agent Communication

## Status

Accepted.

## Context

Previous design had agents with no knowledge of the event bus, a leader-only `delegate` tool, and `session.*.>` subscriptions for tracking pipeline progress. This created coupling between the leader and worker agents and required special injection mechanisms for session events to re-enter the leader's LLM loop.

## Decision

Agents communicate exclusively through topic-based pub/sub on the EventBus (canonical event model and topic list in `doc/specs/jie-platform/03-event-system.md`):

- **User prompts enter as one typed topic** (`user.prompt`, payload carries `teamId` + addressed `agentKey`); every body subscribes and filters on its own identity. No per-agent subjects, no leader-only ingress.
- **`notify(topic, message)`** is the sole inter-agent channel: it publishes on a `custom.` topic and does not end the LLM's turn.
- **Domain topic subscriptions** are declared in the agent's `.md` frontmatter `subscribe:` field.
- **Pipeline order is encoded in the subscription graph** — each agent subscribes to the previous agent's topic.

## Consequences

- No `delegate` tool, no per-agent subjects, no special leader subscriptions; the leader uses `notify` like any other agent.
- The platform is agnostic of topic semantics — agents subscribe to strings; the team blueprint defines the topic namespace and subscription graph.
- Agents can be tested in isolation: publish to a subscribed topic, observe the `notify` output. The subscription graph provides natural pipeline serialization.
