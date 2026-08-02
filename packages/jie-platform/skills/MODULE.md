---
no-new-exports:
  - format-skills.ts
  - index.ts
  - load-skills.ts
  - module.ts
  - parse-skill.ts
  - skill-manager.ts
  - types.ts
---

## Contracts

- `SkillManager.resolve(spec)` matches the spec against skill names as an anchored `Bun.Glob` (mirrors `ToolRegistry.resolve`): a plain name resolves to itself, a wildcard to zero-or-more skills. Zero matches is not an error here; the caller decides the policy.
- `SkillManagerImpl` loads the skills from its directories at construction and replaces the set wholesale on `reload()` (`/reload` refresh — `10-configuration.md`); diagnostics are logged via its own sub-logger, never thrown. `registerSkillsModule` wires it as a process-lifetime singleton, so every consumer sharing the cradle entry observes reloads in place.
- `loadSkills` discovers `<dir>/*/SKILL.md` under the home and project skills directories; project skills override home skills of the same name. A missing directory is silent, an unreadable directory or skill file is a diagnostic, a directory without `SKILL.md` is ignored silently. Parsing and validation are delegated to the pure `parseSkill`.
- `parseSkill` validates a single SKILL.md's content (name charset/length, frontmatter, name/directory match, description) with no I/O; an invalid skill is reported via the `diagnostic` field, never thrown.
- `formatSkillsForPrompt` renders the `<available_skills>` block for the system prompt and dedupes by name; an empty list yields the empty string. Skills are surfaced by progressive disclosure: only name/description/location are listed, the agent loads the body with `read_file`.
