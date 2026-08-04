---
no-new-exports:
  - index.ts
  - load-skills.ts
  - module.ts
  - parse-skill.ts
  - skill-manager.ts
  - skill.ts
  - types.ts
---

## Contracts

- `SkillManager.resolve(spec)` matches the spec against skill names as an anchored `Bun.Glob` (mirrors `ToolRegistry.resolve`): a plain name resolves to itself, a wildcard to zero-or-more skills. Zero matches is not an error here; the caller decides the policy.
- `SkillManagerImpl` loads the skills from its directories at construction and replaces the set wholesale on `reload()` (`/reload` refresh — `10-configuration.md`); diagnostics are logged via its own sub-logger, never thrown. `registerSkillsModule` wires it as a process-lifetime singleton, so every consumer sharing the cradle entry observes reloads in place.
- `loadSkills` discovers `<dir>/*/SKILL.md` under the home and project skills directories; project skills override home skills of the same name. A missing directory is silent, an unreadable directory or skill file is a diagnostic, a directory without `SKILL.md` is ignored silently. Parsing and validation are delegated to the pure `parseSkill`.
- `parseSkill` validates a single SKILL.md's content (name charset/length, frontmatter, name/directory match, description, argument-hint) with no I/O and captures the prose body (trimmed) and the optional `argument-hint` (trimmed, blank → null) for invocation expansion and autocomplete; an invalid skill is reported via the `diagnostic` field, never thrown. It builds the `Skill` through `createSkill`.
- `createSkill` is the only constructor of `Skill`; prompt rendering belongs to the skill itself. `expandInvocation(args)` renders the `<skill name location>` block carrying the body (references resolve against `baseDir`): when the body holds `$ARGUMENTS`/`$n` placeholders the args are interpolated into it (`$ARGUMENTS` = whole string, `$n` = n-th token, missing → empty, inserted verbatim in one pass), otherwise the args are appended after the block, as in pi. `promptEntry()` renders the escaped `<available_skills>` entry (name/description/location — progressive disclosure, the agent loads the body with `read_file`). Parsing a `/skill:<name>` invocation and looking the name up is the agent body's job (`06-agent-model.md` "Skill invocation"); assembling the skills block (dedupe, header, wrapper) is the prompt composer's.
