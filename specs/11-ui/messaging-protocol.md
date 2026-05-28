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
  content: string;        // the prompt body (free-form text, may embed a task_id if the user wishes)
  source?: string;        // optional client identifier ('tui', 'cli', 'web', 'ide-plugin')
  reply_id?: string;      // 8-hex for request-response (jie prompt); absent for fire-and-forget (TUI)
  timestamp: string;      // ISO 8601
}
```

`prompt_id` is a client-generated UUID (v4 or ULID). The DM uses it for logging and deduplication; it is not embedded in the event bus subjects.

`content` is the prompt body. Interpretation is DM-specific: a task request, a status query, a question, etc. The user may embed a `task_id` in the text (e.g. `"status of PROJ-123"`); the DM parses it from the content.

`source` is optional metadata for observability. The DM may use it to tailor response format (e.g. markdown for web, plain text for CLI) but this is unspecified in v1.

`reply_id` is set by `jie prompt` for the request-response pattern. When present, the DM MUST publish a `PromptResponse` to `team.{team_id}.response.{reply_id}` after processing the prompt. If absent, the prompt is fire-and-forget (TUI behavior).

### Request-Response (`jie prompt`)

When a prompt carries a `reply_id`, the CLI submits it and waits for a direct response from the DM:

1. CLI generates a random `reply_id` (8 hex chars).
2. CLI publishes `PromptMessage` with `reply_id` set to `team.{team_id}.prompt`.
3. CLI subscribes to `team.{team_id}.response.{reply_id}`.
4. DM receives the prompt, interprets the content, and publishes a `PromptResponse` to `team.{team_id}.response.{reply_id}`.
5. CLI receives the response, outputs it, and exits.

```typescript
interface PromptResponse {
  reply_id: string;
  content: string;      // the DM's response text
  error?: string;        // set if the DM could not process the prompt
  timestamp: string;     // ISO 8601
}
```

If the DM cannot process the prompt (invalid content, task not found, internal error), it sets `error` with a reason string. If processing succeeds, `error` is absent and `content` carries the response.

### Durability

Prompts are **ephemeral**. If the DM is offline when a prompt is published, the message is lost. Clients are responsible for retry logic. Rationale: prompt queueing and backlog management are complex; v1 keeps it simple.

## Result Observation

### TUI: Session Event Subscription

The TUI observes task results by subscribing to session events. With the v1 single-task-in-flight invariant, there is at most one task at a time — the TUI subscribes to `session.*.task.>` and the next `task.recorded` after a prompt is published belongs to that prompt.

1. TUI publishes prompt (fire-and-forget, no `reply_id`).
2. TUI subscribes to `session.*.task.recorded` (and all `session.*.task.>` for ongoing sessions).
3. DM receives prompt, extracts or mints `task_id` from the content, mints `session_id`, writes `task` artifact, emits `task.recorded`.
4. TUI picks up `task.recorded`, extracts `session_id`, subscribes to `session.{session_id}.>` for full pipeline visibility.

### CLI: Request-Response

The CLI (`jie prompt`) uses the `reply_id` mechanism described above. It does not subscribe to session events. The DM processes the prompt and sends a single `PromptResponse` to `team.{team_id}.response.{reply_id}`.

### Terminal Events

Once the TUI has the `session_id`, it observes the full pipeline via standard subscriptions (see `03-event-system.md`). Terminal events of interest:

- `task.done` — task completed successfully. Payload includes `review_artifact_id`.
- `task.failed` — task failed. Payload includes `error` and `phase`.
- `task.rejected` — DM declined to start a session. Payload includes `reason`.

The client reads artifacts (via `read_artifact(artifact_id)`) to display results.

### TUI-Specific Invariant

The TUI (see `tui.md` in this directory) is **read-only with one exception**: it may publish prompt messages to `team.{team_id}.prompt`. This is the only subject the TUI is permitted to publish to. All other TUI interactions are read-only subscriptions to `session.*.*` and artifact store reads.

## DM Subscription

The DM subscribes to `team.{team_id}.prompt` at startup. On prompt receipt:

1. Interpret the prompt content to determine intent (task request, status query, question, etc.).
2. Check single-task-in-flight invariant (see `08-role-definitions.md`). If a task is already in flight, queue the prompt in DM working memory and defer.
3. For task requests: mint `session_id` (stateless hash of `(timestamp_ns, team_id, nonce)`), extract or mint `task_id` from the content, write `task` artifact via `write_artifact`, call `notify('task.recorded', { task_artifact_id })`.
4. If `reply_id` is set in the prompt, publish a `PromptResponse` to `team.{team_id}.response.{reply_id}` with the appropriate `content`.
5. If `reply_id` is absent (TUI), the prompt is fire-and-forget.

If the DM cannot process the prompt (content is empty, malformed, or no meaningful task can be derived):
- If `reply_id` is set → respond with `error` set in the `PromptResponse`.
- Otherwise → emit `task.rejected` per `08-role-definitions.md` "On Pre-Record Failure".

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
     content: "Implement PROJ-123: add retry logic to HTTP client",
     source: "tui",
     timestamp: "2026-05-27T10:30:00Z"
   }
5. DM receives prompt, extracts task_id "PROJ-123" from content, mints session_id "a1b2c3d4e5f67890".
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
