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
`resolve` matches anchored `Bun.Glob`; zero matches is not an error. `loadSkills` discovers `SKILL.md`; project overrides home. Parsing is pure (`parseSkill`); invalid skills log diagnostics, never thrown. Prompt rendering belongs to the skill; invocation assembly to the prompt composer.
