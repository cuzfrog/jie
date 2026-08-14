---
leader: manager
description: six-role kanban pipeline, coordinated by notify and kanban claims
---

Default software-delivery team. Six roles form a pipeline on `task` work units: manager records tasks; researcher, architect, planner, implementer, and reviewer handle successive stages. Implementer and reviewer run two replicas and coordinate through `update_kanban` claims. No role addresses another by identity; all coordination is `notify` on `task.*` topics and kanban state. One task in flight per team.
