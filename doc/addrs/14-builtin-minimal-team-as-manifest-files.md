# ADR 14: Built-in Minimal Team as Manifest Files

## Status

Accepted. The platform ships a built-in minimal team as two `.md` manifest files, format-consistent with user teams, loaded at module-load time via `import` attributes.

## Context

ADR 11 §3 (the prior version of this ADR's decision section) decided that the platform ships a hardcoded built-in minimal team as a TypeScript constant in `packages/jie-platform/team/built-in/minimal-team.ts`. The rationale was: "a TypeScript constant, not a `.md` file" — making the platform agnostic of any `.md` parser at the built-in level.

This works, but has two consequences worth fixing:

1. **Two code paths in the team loader.** The user-team path parses `TEAM.md + *.md` from a directory. The built-in path returns a TypeScript constant. The "one code path" property the rest of the loader assumes is broken: a future change to the manifest format (e.g. a new frontmatter field) has to be made in two places.
2. **The built-in is a different format than user teams.** The team format is `.md` (per ADR 3). The built-in is `.ts` (a JS object literal). A user looking at the platform's source to understand "what does a team look like?" finds a TypeScript object literal, not a `.md` file. This contradicts the declarative-blueprint story ADR 3 told.

The natural runtime-resolution path: the built-in's `.md` content can be bound to a string at module-load time using `import ... with { type: 'text' }` (TC39 import attributes, shipped in bun ≥ 1.3). This avoids the `import.meta.url` + `path.join` + `fs.readFileSync` dance that the alternative "load from a known path" approach would require, and works the same way in the monorepo and after `bun install -g`.

## Decision

The platform ships a built-in minimal team as two `.md` files:

```
packages/jie-platform/team/minimal/
  TEAM.md      # frontmatter: leader: general
  general.md   # role: general, tools: [bash, read_file, write_file]
```

These files are format-identical to user team manifests (frontmatter + prose body), and the team-blueprint loader's user-team code path is reused with no special cases.

The team-blueprint loader has one parser; two entry points:

```typescript
// team/loader.ts

// Bound at module-load time. Bun reads the file and gives us a string.
// No `import.meta.url`, no `fs.readFileSync`, no `process.cwd()`.
import minimalTeamMd from './minimal/TEAM.md' with { type: 'text' };
import minimalAgentMd from './minimal/general.md' with { type: 'text' };

/** Single code path: parse frontmatter + prose body, return AgentSoul[]. */
export function parseTeamFromManifests(
  manifests: Record<fileName, content>
): TeamBlueprint;

/** User teams: read all *.md in a directory, delegate to parser. */
export function loadTeamFromDir(dirPath: string): TeamBlueprint;

/** Built-in: pass the imported strings to the parser. */
export function loadMinimalTeam(): TeamBlueprint {
  return parseTeamFromManifests({
    'TEAM.md':    minimalTeamMd,
    'general.md': minimalAgentMd,
  });
}
```

The `TeamBlueprint` shape (returned by all three entry points):

```typescript
// packages/jie-platform/team/loader.ts

/**
 * A parsed team blueprint. The loader returns one of these from every entry
 * point (`loadTeamFromDir`, `loadMinimalTeam`). The `startJie` entry consumes
 * it: walks the `roles` to build `AgentSoul`s, resolves the leader from
 * `leaderRole` (or the single role in `roles` for the single-agent-without-
 * TEAM.md case, per 06-agent-model.md "Platform Auto-Wiring"), and constructs
 * one AgentBody per role with `is_leader` set per the leader-identification
 * rules.
 */
export interface TeamBlueprint {
  /** Sorted alphabetically by role stem; the order is preserved through
   *  soul construction and body instantiation. The CLI sources the TUI's
   *  `roles` parameter from this list. */
  roles: AgentSoul[];

  /** The role stem of the leader. `null` only for the empty-team edge case
   *  (no `.md` files in the team directory), where `roles` is also `[]`
   *  and the team is silently ignored. For single-agent teams without
   *  TEAM.md, this is the single role's stem (implicit-leader rule). For
   *  multi-agent teams, this is TEAM.md's `leader:` value (and must match
   *  one of the role stems in `roles` — verified by the parse-errors
   *  table in 06-agent-model.md). */
  leaderRole: string | null;
}
```

`AgentSoul` is the role's parsed soul per `06-agent-model.md` "AgentSoul" (model, system_prompt, tools, subscribe). The loader does NOT attach the team's resolved `team_id` to the blueprint; `team_id` is a runtime concern supplied by `startJie` (the directory name of `.jie/teams/<id>/` or the built-in minimal sentinel), not a parse-time artifact. The blueprint is the static, team-id-agnostic result of parsing the `.md` files.

The `parseTeamFromManifests` parser is the **only** place that knows about frontmatter syntax and role-file shape. `loadTeamFromDir` and `loadMinimalTeam` differ only in where the bytes come from.

### Built-in selection

`10-configuration.md` "Team Selection" step 4 (built-in minimal) calls `loadMinimalTeam()` when:

- No `--team <id>` is given.
- `defaultTeam` from merged settings is unset, stale (and no user teams are installed to recover to), or absent.
- No first-available user team is found.

The "always has a runnable team" guarantee (per `12-installation.md` "First-Run Credentials and Model") is preserved: `loadMinimalTeam()` is the last-resort path and the `with { type: 'text' }` import either resolves (file shipped) or fails the build (file missing). There is no runtime "did we ship the file?" check.

### Why `import` attributes (not `import.meta.url`)

Two reasons not to use `import.meta.url`:

1. **The bytes can be bound at module-load time.** `with { type: 'text' }` is bun's and Node's modern way to import a file as a string. The path is resolved by the runtime's module resolver — the same code that resolves `import x from './foo.js'`. The platform's code never has to do filesystem lookup for the built-in.
2. **`import.meta.url` requires a `fileURLToPath` + `path.join` dance** that breaks subtly across symlinks, Windows, and `bun install -g` install locations. `import` attributes avoid all of that.

## Rationale

- **One code path in the loader.** The manifest format (frontmatter, prose body, role names, leader declaration) is defined once, in `parseTeamFromManifests`. The user-team and built-in paths delegate to it. A future format change (e.g. `model:` becomes required, or a new `subscribe:` field) is a single-file edit.
- **Built-in looks like a user team.** A user reading `team/minimal/TEAM.md` reads a `.md` file, not a TypeScript object literal. The format is the format; the source of truth is the same.
- **`import` attributes are the boring, correct answer.** Bun supports them; the alternative (`fs.readFileSync(path.join(import.meta.dirname, 'minimal', 'TEAM.md'))`) is more code with more failure modes. The import is resolved at module-load time; the bytes are a string; the rest is the parser.
- **Bun-only is fine for v1.** The platform's runtime is bun (per `monorepo-structure.md` "Build System"). Node 22+ also supports import attributes, but bun is the only declared target. If a non-bun runtime is needed in the future, the import can be replaced with a `fs.readFileSync` of a `__dirname`-relative path; the loader's contract is unchanged.

## Consequences

- `packages/jie-platform/team/minimal/TEAM.md` and `team/minimal/general.md` exist as plain `.md` files in the platform's source tree.
- `packages/jie-platform/team/loader.ts` exports `parseTeamFromManifests`, `loadTeamFromDir`, and `loadMinimalTeam`. The two `.md` strings are imported via `with { type: 'text' }` at the top of the file.
- The built-in is no longer "different from user teams" — both are `.md` files parsed by the same function. A user copying the built-in's `.md` files to `~/.jie/teams/minimal/` overrides the built-in transparently, and the override is byte-for-byte the same format.
- The `monorepo-structure.md` description of `team/` is updated: it has `loader.ts` plus the `minimal/` directory of `.md` files.
