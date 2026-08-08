---
no-new-exports: []
---

## jie-team
- Team blueprints shipped as plain manifest directories at the package root (`<id>/TEAM.md` + `<role>.md` - the exact format the platform's team registry parses). A pure content package: no install hook, no runtime surface, no module entry (ADR 11). Installed by `@cuzfrog/jie-team-installer`, which scans the package root for `<id>/TEAM.md` directories and copies them into a `.jie/teams/<id>/` directory where the platform discovers them at startup.
- Ships one blueprint, `default-coders`: the six-role delivery pipeline of `doc/specs/jie-team/00-overview.md` (manager, researcher, architect, planner, implementer, reviewer) with constrained per-role tool sets, `notify`/artifact coordination conventions, and a lifecycle declaration (phase transitions, iteration cap, write gates) that the platform enforces generically. The two-role code-lens team lives untracked at `.jie/teams/dev` as a local test fixture.
- The team-id charset and reserved ids live in `jie-team-installer` (the install-time authority); this package only ships content, so it carries no id-validation logic.
