## manifest
Runtime-agnostic manifest content for Jie. `teams/` holds team blueprint directories (`<id>/TEAM.md` + `<role>.md`); `agents/` holds shared single-agent manifests (`<id>.md`) that any team may reference via `additional-agents:`; `installer/` is the CLI-side manifest installer that copies both into `.jie/` or `~/.jie/`. The platform reads installed copies from `.jie/teams/` and `.jie/agents/` and never imports this module directly.

### agents
Shared single-agent manifests (`<id>.md`) with the same frontmatter syntax. A team references them from `TEAM.md` under `additional-agents:`. The runtime resolves installed shared agents from `.jie/agents/<id>.md` (project overrides user) and merges them into the team as additional roles.

### teams
Team blueprints shipped as plain manifest directories (`<id>/TEAM.md` + `<role>.md` - the exact format the platform's team registry parses). Pure content: no install hook, no runtime surface, no module entry. Installed by `src/manifest/installer`, which scans the source root for `teams/<id>/TEAM.md` directories and copies them into a `.jie/teams/<id>/` directory where the platform discovers them at startup.
