---
no-new-exports: []
---

## team-content
- Team blueprints shipped as plain manifest directories (`<id>/TEAM.md` + `<role>.md` - the exact format the platform's team registry parses). Pure content: no install hook, no runtime surface, no module entry. Installed by the team installer (`src/team-installer`), which scans the source root for `<id>/TEAM.md` directories and copies them into a `.jie/teams/<id>/` directory where the platform discovers them at startup.
