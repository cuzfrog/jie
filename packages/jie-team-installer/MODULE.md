---
no-new-exports:
  - index.ts
  - installer.ts
  - installer.test.ts
  - source.ts
  - source.test.ts
---

## jie-team-installer
- Installs team manifests from a source (npm package, git repo, or local path) into a teams directory (`<teamsDir>/<id>/`), where jie-platform discovers them at runtime (ADR 11 agnosticism, ADR 24 discovery). Pure orchestration over injectable I/O ports (`InstallerDeps`): parse spec -> resolve to a local dir -> scan for `<id>/TEAM.md` manifest dirs -> copy `.md` files -> record provenance (`.source.json`).
- `source.ts` is pure spec parsing (npm/git/file detection, no I/O); `installer.ts` is the install/remove/query surface plus filesystem-edge resolution. Network/subprocess I/O goes through `InstallerDeps` so unit tests inject mocks; `defaultInstallerDeps` provides the real `fetch`/`git`/`tar` implementations.
- The team-id charset and reserved ids (`add`/`list`/`remove`) mirror the platform's team-id rules; reserved ids prevent `jie team <subcommand>` ambiguity. Re-declared here because platform internals are not importable across packages (ADR 11).
