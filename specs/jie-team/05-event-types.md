# Team Event Types

Domain event types defined by the default software development team blueprint. These build on the platform's event envelope (`jie-platform/03-event-system.md`).

## Event Type Union

```typescript
type TeamEventType =
  | PlatformEventType          // agent.stream.chunk, agent.stream.end, agent.tool.call, agent.tool.result
  | 'task.recorded'            // DM wrote task artifact; session begins
  | 'task.rejected'            // DM declined to start a session (pre-record failure)
  | 'task.researched'          // Researcher completed
  | 'task.designed'            // Architect updated module descriptor
  | 'task.planned'             // Planner completed (iteration N)
  | 'task.implemented'         // Implementer completed (iteration N)
  | 'task.review_passed'       // Reviewer accepted; iteration ends successfully
  | 'task.review_failed'       // Reviewer rejected; planner picks up for next iteration
  | 'task.done'                // DM finalized a review_passed task (terminal)
  | 'task.failed';             // Any role signals unrecoverable failure (terminal)
```

## Event Payloads

```typescript
type TaskEventPayload<T extends TeamEventType> =
  T extends 'task.recorded'       ? { task_id: string; task_artifact_id: string } :
  T extends 'task.rejected'       ? { task_id: string; reason: string } :
  T extends 'task.researched'     ? { task_id: string; research_artifact_id: string } :
  T extends 'task.designed'       ? { task_id: string; descriptor_paths: string[] } :
  T extends 'task.planned'        ? { task_id: string; iteration: number; plan_artifact_id: string } :
  T extends 'task.implemented'    ? { task_id: string; iteration: number; result_artifact_ids: string[] } :
  T extends 'task.review_passed'  ? { task_id: string; iteration: number; review_artifact_id: string } :
  T extends 'task.review_failed'  ? { task_id: string; iteration: number; review_artifact_id: string } :
  T extends 'task.done'           ? { task_id: string; review_artifact_id: string } :
  T extends 'task.failed'         ? { task_id: string; error: string; phase: string } :
  never;
```

## Durability

All `task.*` events are **durable** on JetStream. They carry task lifecycle state and must survive agent restarts.

## Subscription Graph

```
DM:          team.{team_id}.prompt, task.review_passed, task.failed
Researcher:  task.recorded
Architect:   task.researched
Planner:     task.designed, task.review_failed
Implementer: task.planned
Reviewer:    task.implemented
```

No central router. No agent is aware of other agents by identity.

## Notes

- `task.rejected` has no corresponding `task_status` row. It is a pre-record signal.
- `task.done` is the only permanent, non-re-enterable phase.
- Tool telemetry events (`agent.tool.*`) and stream events (`agent.stream.*`) are platform-level and observer-only.
