# ADR 1: Topic-Based Pub/Sub Agent Communication

## Status

Accepted.

## Context

Previous design had agents with no knowledge of the event bus, a leader-only `delegate` tool, and `session.*.>` subscriptions for tracking pipeline progress. This created coupling between the leader and worker agents and required special injection mechanisms for session events to re-enter the leader's LLM loop.

## Decision

Agents communicate exclusively through topic-based pub/sub on the EventBus:

- User prompts: `user.prompt` topic; bodies filter by identity.
- `notify` is the inter-agent channel (`custom.` topics).
- Domain subscriptions declared in agent `.md` `subscribe:` field.
- Pipeline order encoded in subscription graph.

## Consequences

- No `delegate` tool, no per-agent subjects, no special leader subscriptions; the leader uses `notify` like any other agent.
- The platform is agnostic of topic semantics — agents subscribe to strings; the team blueprint defines the topic namespace and subscription graph.
- Agents can be tested in isolation: publish to a subscribed topic, observe the `notify` output. The subscription graph provides natural pipeline serialization.
