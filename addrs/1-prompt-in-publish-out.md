# ADR 1: Prompt-In / Publish-Out Agent Model

## Status

Accepted.

## Context

Previous design had agents subscribing to domain events (`session.*.task.recorded`, etc.) via a subscription graph defined in the team blueprint. This created a tightly-coupled pipeline where every agent was aware of the event bus and the platform needed to manage subscription topologies, JetStream replay, and agent-dependent spawn ordering.

## Decision

Agents have no knowledge of the event bus. They receive prompts and use tools. Communication model:

- **Non-leader agents** subscribe only to `team.{team_id}.prompt.{role}` — a personal ingress channel.
- **The leader** subscribes to `team.{team_id}.prompt` (user ingress) and `session.*.>` (tracking pipeline).
- **`delegate` tool** (leader-only) publishes a prompt to another agent's ingress channel.
- **`notify` tool** (all agents) publishes exactly one domain event to signal turn completion, gated by `soul.notify` (a whitelist in the agent's `.md` frontmatter).
- Pipeline order is described in the leader's system prompt prose, not encoded in a subscription graph.

## Consequences

- Platform has no knowledge of pipeline topology. No subscription graph to parse, no topological sort for spawn order, no JetStream replay.
- Team workflows are defined in natural language (leader's prose), not config. Custom pipelines require no code changes.
- Zero-event-subscription agents can be tested in isolation — feed a prompt, observe the `notify` output.
- The leader is a single point of orchestration. If the leader crashes, the pipeline stalls until supervisor restarts it.
