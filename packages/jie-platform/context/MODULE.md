---
no-new-exports:
  - format-context.ts
  - index.ts
  - load-context-files.ts
  - module.ts
  - types.ts
---

## Contracts

- `loadContextFiles` reads `AGENTS.md` then `CLAUDE.md` from the home jie dir, then from every ancestor of `cwd` ordered root-down-to-`cwd`; missing or unreadable files are skipped silently and a path is loaded at most once. Returns files in load order (global first, most-specific last).
- `formatContextFilesForPrompt` renders the `<context_files>` block for the system prompt; an empty list yields the empty string. File content is injected verbatim so the agent reads it as written; only the `path` attribute is XML-escaped.
- `registerContextModule` registers the boot-time `systemContextBlock` string. It is shared project state, applied to every agent's system prompt ahead of the role prose.
