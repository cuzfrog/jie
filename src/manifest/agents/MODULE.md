## agents
Shared single-agent manifests (`<id>.md`) with the same frontmatter syntax. A team references them from `TEAM.md` under `additional-agents:`. The runtime resolves installed shared agents from `.jie/agents/<id>.md` (project overrides user) and merges them into the team as additional roles.
