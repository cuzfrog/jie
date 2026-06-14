# Team Event Types

Domain event types defined by the default software development team blueprint. These build on the platform's event envelope (`jie-platform/03-event-system.md`).

Domain events are published to topics via `notify(topic, prompt)`. The `event_type` in the envelope equals the topic name. The `prompt` is the natural-language content the agent sends.

## Event Type Union

```typescript
type TeamEventType =
  | PlatformEventType          // agent.stream.chunk, agent.stream.end, agent.tool.call, agent.tool.result
  | 'task.recorded'            // DM wrote task artifact; work unit begins
  | 'task.rejected'            // DM declined to start a work unit (pre-record failure)
  | 'task.researched'          // Researcher completed
  | 'task.designed'            // Architect updated module descriptor
  | 'task.planned'             // Planner completed (iteration N)
  | 'task.implemented'         // Implementer completed (iteration N)
  | 'task.review_passed'       // Reviewer accepted; iteration ends successfully
  | 'task.review_failed'       // Reviewer rejected; planner picks up for next iteration
  | 'task.done'                // DM finalized a review_passed task (terminal)
  | 'task.failed';             // Any role signals unrecoverable failure (terminal)
```

## Subscription Graph

```
DM:          leader.prompt (platform auto), task.review_passed, task.failed
Researcher:  task.recorded
Architect:   task.researched
Planner:     task.designed, task.review_failed
Implementer: task.planned
Reviewer:    task.implemented
```

No central router. No agent is aware of other agents by identity. The leader auto-subscribes to `leader.prompt` via platform auto-wiring; all other subscriptions are declared in `.md` frontmatter `subscribe:`.

## Notes

- `task.rejected` has no corresponding `task_status` row. It is a pre-record signal.
- `task.done` is the only permanent, non-re-enterable phase.
- Tool telemetry events (`agent.tool.*`) and stream events (`agent.stream.*`) are platform-level and observer-only.
- The `prompt` parameter in `notify` carries natural-language content (task IDs, artifact IDs, results). Structured payload enforcement is the responsibility of the team blueprint's system prompts, not the platform.
