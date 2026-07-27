---
no-new-exports:
  - index.ts
  - installer.test.ts
  - installer.ts
---

## jie-team
- Team blueprints shipped as plain manifest directories (`blueprints/<id>/TEAM.md` + `<role>.md` — the exact format the platform's team registry parses) plus an installer that copies a blueprint into a `.jie/` directory (`<targetJieDir>/teams/<id>/`), where the platform discovers it at startup.
- The MVP ships one blueprint, `dev`: a two-role team (lead + architect) exercising inter-agent `notify` coordination and code-lens MCP tools (`mcp:code-lens:*`) on the architect. The full pipeline blueprint in `doc/specs/jie-team/00-overview.md` is not implemented yet.
- `installer.ts` is filesystem-edge code with the logic inline; the default blueprints dir resolves from `import.meta.dir` so the package works straight from the bun workspace without a build step.
- The blueprint id pattern mirrors the platform's team-id pattern by design (installed blueprints become team ids); it is redeclared here because platform internals are not importable across packages.
