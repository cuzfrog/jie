---
leader: dm
---

Default software-delivery team. Six roles form a serial pipeline on `task` work units: the Delivery Manager (`dm`, the leader and sole user contact) records a task; `researcher`, `architect`, `planner`, `implementer`, `reviewer` each subscribe to the previous role's topic, so the pipeline serializes itself — no role addresses another by identity, all coordination is `notify` on `task.*` topics. One task in flight per team; durable state lives in artifacts under `{task_id}/task|research|design|plan|review`. See each role file for its contract and `doc/specs/jie-team/00-overview.md` for the full design.
