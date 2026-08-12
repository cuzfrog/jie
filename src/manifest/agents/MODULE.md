---
no-new-exports: []
---

## agents
Shared single-agent manifests (`<id>.md`) with the same frontmatter as a team role (`tools`, `model`, `subscribe`, `skills`, `target_context_window_size`). A team references them from `TEAM.md` under `additional-agents:`. The runtime resolves installed shared agents from `.jie/agents/<id>.md` (project overrides user) and merges them into the team as additional roles.
