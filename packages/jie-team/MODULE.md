---
no-new-exports:
  - index.ts
  - installer.test.ts
  - installer.ts
---

## jie-team
- Team blueprints shipped as plain manifest directories at the package root (`<id>/TEAM.md` + `<role>.md` — the exact format the platform's team registry parses) plus an installer that copies a blueprint into a `.jie/` directory (`<targetJieDir>/teams/<id>/`), where the platform discovers it at startup.
- Ships one blueprint, `default-coders`: the six-role delivery pipeline of `doc/specs/jie-team/00-overview.md` (dm, researcher, architect, planner, implementer, reviewer) with constrained per-role tool sets, `notify`/artifact coordination conventions, and a lifecycle declaration (phase transitions, iteration cap, write gates) that the platform enforces generically. The two-role code-lens team lives untracked at `.jie/teams/dev` as a local test fixture.
- `installer.ts` is filesystem-edge code with the logic inline; the default blueprints dir is the package root (`import.meta.dir`), so the package works straight from the bun workspace without a build step. Non-team files (`index.ts`, `installer.ts`, …) carry no `TEAM.md` and are ignored by the listing.
- The blueprint id pattern mirrors the platform's team-id pattern by design (installed blueprints become team ids); it is redeclared here because platform internals are not importable across packages.
