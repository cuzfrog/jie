# Messaging Protocol

How external clients (TUI, CLI, web UI, IDE plugins) submit prompts to the DM and observe results.

## Transport

Clients connect directly to the NATS bus. No intermediary server, no REST API, no proxy. Any client that can speak NATS can submit prompts and observe sessions.

## Prompt Submission

### Subject

```
team.{team_id}.prompt
```

Clients publish prompt messages to the team-scoped prompt subject. The DM subscribes to this subject.

### Envelope

```typescript
interface PromptMessage {
  prompt_id: string;      // client-generated UUID; for deduplication and logging
  task_id?: string;       // user-supplied task identifier (e.g. 'PROJ-123'); DM mints if absent
  content: string;        // the prompt body (free-form text, issue URL, etc.)
  source?: string;        // optional client identifier ('tui', 'cli', 'web', 'ide-plugin')
  timestamp: string;      // ISO 8601
}
```

`prompt_id` is a client-generated UUID (v4 or ULID). The DM uses it for logging and deduplication; it is not embedded in the event bus subjects.

`task_id` is optional. If supplied, the DM validates charset `[A-Za-z0-9_-]` and max 64 chars (per `03-event-system.md`). If absent, the DM mints `prompt-{hash8}` over the content.

`content` is the prompt body. Interpretation is DM-specific: a JIRA issue URL, a GitHub issue reference, free-form text describing work, etc.

`source` is optional metadata for observability. The DM may use it to tailor response format (e.g. markdown for web, plain text for CLI) but this is unspecified in v1.

### Durability

Prompts are **ephemeral**. If the DM is offline when a prompt is published, the message is lost. Clients are responsible for retry logic. Rationale: prompt queueing and backlog management are complex; v1 keeps it simple.

## Result Observation

### Correlation

The client correlates its prompt to the resulting session via `task_id`:

1. Client publishes prompt with `task_id` (user-supplied or client-generated).
2. Client subscribes to `session.*.task.recorded`.
3. DM receives prompt, validates, mints `session_id`, writes `task` artifact (embedding the `task_id`), emits `task.recorded` with `{ task_artifact_id, task_id }` in the payload.
4. Client filters `task.recorded` events by `task_id` to find its session.
5. Client subscribes to `session.{session_id}.>` for full pipeline visibility.

If the client omits `task_id` from the prompt, it cannot correlate via `task_id`. In this case, the client must subscribe broadly to `session.*.task.recorded` and inspect the `task` artifact (via `read_artifact(task_artifact_id)`) to find the prompt content it submitted. This is inefficient; clients should prefer supplying `task_id`.

### Terminal Events

Once the client has the `session_id`, it observes the full pipeline via standard subscriptions (see `03-event-system.md`). Terminal events of interest:

- `task.done` — task completed successfully. Payload includes `review_artifact_id`.
- `task.failed` — task failed. Payload includes `error` and `phase`.
- `task.rejected` — DM declined to start a session. Payload includes `reason`.

The client reads artifacts (via `read_artifact(artifact_id)`) to display results.

### TUI-Specific Invariant

The TUI (see `tui.md` in this directory) is **read-only with one exception**: it may publish prompt messages to `team.{team_id}.prompt`. This is the only subject the TUI is permitted to publish to. All other TUI interactions are read-only subscriptions to `session.*.*` and artifact store reads.

## DM Subscription

The DM subscribes to `team.{team_id}.prompt` at startup. On prompt receipt:

1. Validate `task_id` (if supplied): charset `[A-Za-z0-9_-]`, max 64 chars. Violation → emit `task.rejected` with `reason: 'invalid_task_id'`.
2. Check single-task-in-flight invariant (see `08-role-definitions.md`). If a task is already in flight, queue the prompt in DM working memory and defer.
3. Mint `session_id` (stateless hash of `(timestamp_ns, team_id, nonce)`).
4. Use tools to gather full task content (fetch JIRA issue, parse GitHub URL, or accept prompt body directly).
5. Write `task` artifact via `write_artifact`. The artifact embeds the `task_id` (user-supplied or DM-minted).
6. Call `notify('task.recorded', { task_artifact_id })` with `iteration = 1`. The body's CAS runs; event is published on `session.{session_id}.task.recorded`.

If the DM cannot produce a task artifact (fetch fails, content is empty/malformed), it emits `task.rejected` per `08-role-definitions.md` "On Pre-Record Failure".

## Multi-Team Isolation

Prompts are team-scoped: `team.{team_id}.prompt`. A client connected to NATS can submit prompts to any team it knows the `team_id` for. NATS authentication and authorization (see `02-protocol-stack.md`) restrict which clients can publish to which team subjects. v1 assumes a trusted network; fine-grained ACLs are unspecified.

## Example Flow

```
1. TUI connects to NATS.
2. TUI subscribes to session.*.task.recorded.
3. User types prompt in TUI: "Implement PROJ-123: add retry logic to HTTP client"
4. TUI publishes to team.engineering.prompt:
   {
     prompt_id: "uuid-abc123",
     task_id: "PROJ-123",
     content: "Implement PROJ-123: add retry logic to HTTP client",
     source: "tui",
     timestamp: "2026-05-27T10:30:00Z"
   }
5. DM receives prompt, validates task_id, mints session_id "a1b2c3d4e5f67890".
6. DM writes task artifact (artifact_id 42) with task_id "PROJ-123".
7. DM calls notify('task.recorded', { task_artifact_id: 42 }) with iteration=1.
8. Body publishes session.a1b2c3d4e5f67890.task.recorded with payload:
   { task_artifact_id: 42, task_id: "PROJ-123", iteration: 1 }
9. TUI receives task.recorded, filters by task_id "PROJ-123", extracts session_id.
10. TUI subscribes to session.a1b2c3d4e5f67890.>.
11. Pipeline proceeds: researcher → architect → planner → implementer → reviewer.
12. TUI observes all task.* events and agent.stream.* events.
13. Reviewer emits task.review_passed.
14. DM finalizes (closes JIRA issue), emits task.done.
15. TUI displays completion.
```
