# Messaging Protocol

How external clients (TUI, CLI, web UI, IDE plugins) submit prompts to the leader agent and observe results.

## Transport

Clients connect directly to the NATS bus. No intermediary server, no REST API, no proxy. Any client that can speak NATS can submit prompts and observe sessions.

## Prompt Submission

### Subject

```
team.{team_id}.prompt
```

Clients publish prompt messages to the team-scoped prompt subject. The leader agent (designated by the team blueprint) subscribes to this subject.

### Envelope

```typescript
interface PromptMessage {
  prompt_id: string;      // client-generated UUID; for deduplication and logging
  content: string;        // the prompt body (free-form text)
  source?: string;        // optional client identifier ('tui', 'cli', 'web', 'ide-plugin')
  reply_id?: string;      // 8-hex for request-response (jie prompt); absent for fire-and-forget (TUI)
  timestamp: string;      // ISO 8601
}
```

`prompt_id` is a client-generated UUID (v4 or ULID). The leader uses it for logging and deduplication; it is not embedded in the event bus subjects.

`content` is the prompt body. Interpretation is leader-specific and defined by the team blueprint.

`source` is optional metadata for observability. The leader may use it to tailor response format (e.g. markdown for web, plain text for CLI) but this is unspecified in v1.

`reply_id` is set by `jie prompt` for the request-response pattern. When present, the leader MUST publish a `PromptResponse` to `team.{team_id}.response.{reply_id}` after processing the prompt. If absent, the prompt is fire-and-forget (TUI behavior).

### Request-Response (`jie prompt`)

When a prompt carries a `reply_id`, the CLI submits it and waits for a direct response:

1. CLI generates a random `reply_id` (8 hex chars).
2. CLI publishes `PromptMessage` with `reply_id` set to `team.{team_id}.prompt`.
3. CLI subscribes to `team.{team_id}.response.{reply_id}`.
4. Leader receives the prompt, interprets the content, and publishes a `PromptResponse` to `team.{team_id}.response.{reply_id}`.
5. CLI receives the response, outputs it, and exits.

```typescript
interface PromptResponse {
  reply_id: string;
  content: string;      // the leader's response text
  error?: string;        // set if the leader could not process the prompt
  timestamp: string;     // ISO 8601
}
```

### Durability

Prompts are **ephemeral**. If the leader is offline when a prompt is published, the message is lost. Clients are responsible for retry logic. v1 keeps it simple.

## Result Observation

### TUI: Session Event Subscription

The TUI observes results by subscribing to session events. The team blueprint defines the event types that signal work-unit lifecycle stages.

1. TUI publishes prompt (fire-and-forget, no `reply_id`).
2. TUI subscribes to `session.*.>` (or the team-defined domain event subjects).
3. Leader receives prompt, creates a work unit, publishes the initial lifecycle event.
4. TUI picks up the event, extracts `session_id`, subscribes to `session.{session_id}.>` for full pipeline visibility.

### CLI: Request-Response

The CLI (`jie prompt`) uses the `reply_id` mechanism described above. It does not subscribe to session events. The leader processes the prompt and sends a single `PromptResponse` to `team.{team_id}.response.{reply_id}`.

### Terminal Events

The team blueprint defines which events are terminal. Observers monitor these events to know when a work unit is complete.

The client reads artifacts (via `read_artifact(artifact_id)`) to display results.

### TUI-Specific Invariant

The TUI (see `tui.md`) is **read-only with one exception**: it may publish prompt messages to `team.{team_id}.prompt`. This is the only subject the TUI is permitted to publish to. All other TUI interactions are read-only subscriptions and artifact store reads.

## Leader Subscription

The leader agent subscribes to `team.{team_id}.prompt` at startup. On prompt receipt:

1. Interpret the prompt content to determine intent (defined by the team blueprint).
2. Check work-unit-in-flight constraints per the team blueprint.
3. For work requests: mint `session_id`, create a work unit, call `notify` with the appropriate lifecycle event.
4. If `reply_id` is set, publish a `PromptResponse` to `team.{team_id}.response.{reply_id}`.
5. If `reply_id` is absent (TUI), the prompt is fire-and-forget.

## Multi-Team Isolation

Prompts are team-scoped: `team.{team_id}.prompt`. A client connected to NATS can submit prompts to any team it knows the `team_id` for. NATS authentication and authorization restrict which clients can publish to which team subjects. v1 assumes a trusted network; fine-grained ACLs are unspecified.
