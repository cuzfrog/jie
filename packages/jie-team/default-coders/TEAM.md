---
leader: dm
lifecycle:
  max_iterations: 5
  permanent_phases:
    - done
  transitions:
    - topic: task.recorded
      role: dm
      from: any
      phase: recorded
      iteration: reset
    - topic: task.researched
      role: researcher
      from: recorded
      phase: researched
    - topic: task.designed
      role: architect
      from: researched
      phase: designed
    - topic: task.planned
      role: planner
      from: designed
      phase: planned
    - topic: task.planned
      role: planner
      from: review_failed
      phase: planned
      iteration: increment
    - topic: task.implemented
      role: implementer
      from: planned
      phase: implemented
    - topic: task.review_passed
      role: reviewer
      from: implemented
      phase: review_passed
    - topic: task.review_failed
      role: reviewer
      from: implemented
      phase: review_failed
    - topic: task.done
      role: dm
      from: review_passed
      phase: done
    - topic: task.failed
      role: any
      from: any
      phase: failed
  write_gates:
    - pattern: "**/CONTEXT.md"
      roles:
        - architect
---

Default software-delivery team. Six roles form a serial pipeline on `task` work units: the Delivery Manager (`dm`, the leader and sole user contact) records a task; `researcher`, `architect`, `planner`, `implementer`, `reviewer` each subscribe to the previous role's topic, so the pipeline serializes itself — no role addresses another by identity, all coordination is `notify` on `task.*` topics. One task in flight per team; durable state lives in artifacts under `{task_id}/task|research|design|plan|review`. The `lifecycle` block above is enforced by the platform: every `notify` on a `task.*` topic must carry the `task_id` parameter, transitions outside the table are rejected (including the `max_iterations` cap), and `write_gates` make `**/CONTEXT.md` writable only by the `architect`. See each role file for its contract and `doc/specs/jie-team/00-overview.md` for the full design.
