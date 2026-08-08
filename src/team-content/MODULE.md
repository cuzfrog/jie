---
no-new-exports: []
---

## team-content
- Team blueprints shipped as plain manifest directories (`<id>/TEAM.md` + `<role>.md` - the exact format the platform's team registry parses). Pure content: no install hook, no runtime surface, no module entry (ADR 11). Installed by the team installer (`src/team-installer`), which scans the source root for `<id>/TEAM.md` directories and copies them into a `.jie/teams/<id>/` directory where the platform discovers them at startup.
- Ships one blueprint, `default-coders`: the six-role delivery pipeline of `doc/specs/jie-team/00-overview.md` (manager, researcher, architect, planner, implementer, reviewer) with constrained per-role tool sets, `notify`/artifact coordination conventions, and a lifecycle declaration (phase transitions, iteration cap, write gates) that the platform enforces generically. The two-role code-lens team lives untracked at `.jie/teams/dev` as a local test fixture.
- The team-id charset and reserved ids live in `src/team-installer` (the install-time authority); this directory only ships content, so it carries no id-validation logic.
