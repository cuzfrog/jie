---
no-new-exports:
  - format-skills.ts
  - index.ts
  - load-skills.ts
  - module.ts
  - skill-manager.ts
  - types.ts
---

## Contracts

- `SkillManager.resolve(spec)` matches the spec against skill names as an anchored `Bun.Glob` (mirrors `ToolRegistry.resolve`): a plain name resolves to itself, a wildcard to zero-or-more skills. Zero matches is not an error here; the caller decides the policy.
- `loadSkills` discovers `<dir>/*/SKILL.md` under the home and project skills directories; project skills override home skills of the same name. Invalid skills (bad name charset, missing/over-long description, name/directory mismatch, malformed frontmatter) are reported as diagnostics and skipped, never thrown.
- `formatSkillsForPrompt` renders the `<available_skills>` block for the system prompt and dedupes by name; an empty list yields the empty string. Skills are surfaced by progressive disclosure: only name/description/location are listed, the agent loads the body with `read_file`.
