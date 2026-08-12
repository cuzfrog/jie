# Default-Solo Team — Platform's Built-in Fallback

The default-solo team is the simplest possible `team-blueprint`: one general-purpose leader agent with default tools. It ships as **two `.md` files** inside the platform package at `src/platform/team/default-solo/`, loaded at module-load time via `import ... with { type: "text" }` and parsed by the same parser as user teams (one code path, no special loader). It is the last-resort fallback guaranteeing the platform always has something to run when no user team is selected; a user copy at `~/.jie/teams/default-solo/` or `.jie/teams/default-solo/` overrides it.

## Built-in (Shipped with the Platform)

The platform's built-in default-solo team lives at `src/platform/team/default-solo/`:

```
team/default-solo/
  TEAM.md      # frontmatter: leader: general
  general.md   # role: general, tools: [bash, read_file, write_file, edit, memory_search]
```

These two files are the **last-resort fallback** in the team selection chain — used only when no user-installed team is selected (no `--team` flag, no `defaultTeam` in settings, and no user team manifests available at the standard paths). The parser's `loadDefaultSoloTeam()` reads them via `import` attributes (bun 1.3+) at module-load time:

```typescript
// src/platform/team/parser.ts
import { BUILTIN_DEFAULT_SOLO_TEAM_ID, type TeamBlueprint } from "./types";
import DEFAULT_SOLO_TEAM_MD from "./default-solo/TEAM.md" with { type: "text" };
import DEFAULT_SOLO_GENERAL_MD from "./default-solo/general.md" with { type: "text" };

export function loadDefaultSoloTeam(): TeamBlueprint {
  return parseTeamFromManifests(
    { "TEAM.md": DEFAULT_SOLO_TEAM_MD, "general.md": DEFAULT_SOLO_GENERAL_MD },
    { teamId: BUILTIN_DEFAULT_SOLO_TEAM_ID },
  );
}
```

The parser is the same one used for user teams; the only difference is where the bytes come from. There is no special-case "this is the built-in" code path.

| Property | Value |
|---|---|
| Roles | 1 (`general`). The role id is the filename stem (`general.md` → role `general`). |
| Leader | `general-1` (the only agent; user prompts reach it via the `user.prompt` topic. No `subscribe:` in frontmatter, so no domain topics.) The agent key is `<role>-1`. |
| Domain topics | None (no subscription graph; the leader is the only agent) |
| Tools | `bash`, `read_file`, `write_file`, `edit_file`, `memory_add`, `memory_search` |
| Model | Inherited from merged settings — see "Model" below |
| System prompt | A general-purpose assistant prompt — see "Built-in System Prompt" below |

### Built-in System Prompt

```
You are a general-purpose assistant running inside the Jie (界) platform. The user will send you prompts. Use your tools (`bash`, `read_file`, `write_file`, `edit_file`, `memory_add`, `memory_search`) to help them. Tell the user they can install a custom team blueprint for complex work.
```

The system prompt is intentionally short: it establishes identity and points users at the right next step for richer workflows.

## User-Installed Override

A user can place `TEAM.md` and `general.md` (the default-solo-team shape) at `~/.jie/teams/default-solo/` (global) or `.jie/teams/default-solo/` (project-local, walking up from CWD). Once installed, the user-installed `default-solo` team takes precedence over the platform's built-in. The override is byte-for-byte the same `.md` format as the built-in; the parser does not distinguish "platform's built-in" from "user's copy" once the bytes are in hand.

```
.jie/teams/default-solo/
 TEAM.md      # frontmatter: leader
 general.md   # agent definition (name, optional model, tools, optional subscribe, system_prompt)
```

## Model

The default-solo team does not pin a model. The leader's `(provider, modelId)` is resolved from the user's merged settings at startup, following the chain in `10-configuration.md` "Model Resolution".

Model resolution happens at team load: if no model is configured (the soul pins none and settings define no `defaultProvider`/`defaultModel`), load fails with `NO_MODEL_ERROR` and the CLI exits 1; a model string that fails to resolve throws `MODEL_UNRESOLVED` naming the model and role — the single-agent team's only role is its leader, so an unresolvable default model fails the load rather than producing a leaderless team. A missing model is thus a load-time error, not a runtime one.

Users who want a different model globally run `jie model <provider>/<modelId>` (or edit `~/.jie/settings.json` directly). Users who want a different model for the default-solo team specifically can install their own `general.md` (which can pin a model in frontmatter) and place it at one of the standard paths.

## Behavior

The leader processes a single user prompt per turn. There are no domain topics, so no inter-agent coordination happens. The leader's tools (`bash`, `read_file`, `write_file`, `edit_file`, `memory_add`, `memory_search`) are available for direct work in the workspace — no artifact store is exposed because there are no peers to coordinate with.

## Why a Built-in Fallback

A user can run `jie` in any directory with minimal setup: run `jie login` (once, for credentials) and `jie model <provider>/<id>` (once, to pick a model). After those two commands, the platform always has a runnable configuration — a single binary, a single command, a working agent, even if the user has not created any project files or installed any team. The built-in default-solo team is the last-resort guarantee: as long as a model is configured, `jie` will run.

The login + model step is the *only* setup the platform requires; everything else is optional. Team selection is a runtime choice (via `jie team <id>`, `/team <id>`, or `--team <id>`); without a selection, the platform falls back to the built-in default-solo team.
