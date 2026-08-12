---
no-new-exports:
  - installer.test.ts
  - source.test.ts
---

## installer
CLI-side installer that resolves an npm/git/file manifest source and copies `teams/<id>/` into `.jie/teams/<id>/` and `agents/<id>.md` into `.jie/agents/<id>.md`. It is a runtime dependency of `src/cli`; `src/platform` never imports it.
