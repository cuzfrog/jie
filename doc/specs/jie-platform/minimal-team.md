# Minimal Team — Platform's Built-in Fallback

The minimal team is the simplest possible `team-blueprint`: one general-purpose leader agent with default tools. The platform ships a built-in minimal team as **two `.md` files** at `packages/jie-platform/team/minimal/` — the same format as user teams. A user (or a downstream team package) can install a richer minimal team at `~/.jie/teams/minimal/` or `.jie/teams/minimal/` to override the platform's built-in.

## Built-in (Shipped with the Platform)

The platform's built-in minimal team lives at `packages/jie-platform/team/minimal/`:

```
team/minimal/
  TEAM.md      # frontmatter: leader: general
  general.md   # role: general, tools: [bash, read_file, write_file]
```

These two files are the **last-resort fallback** in the team selection chain — used only when no user-installed team is selected (no `--team` flag, no `defaultTeam` in settings, and no user team manifests available at the standard paths). The team-blueprint loader's `loadMinimalTeam()` reads them via `import` attributes (bun 1.3+) at module-load time:

```typescript
// packages/jie-platform/team/loader.ts
import minimalTeamMd  from './minimal/TEAM.md'    with { type: 'text' };
import minimalAgentMd from './minimal/general.md' with { type: 'text' };

export function loadMinimalTeam(): TeamBlueprint {
  return parseTeamFromManifests({
    'TEAM.md':    minimalTeamMd,
    'general.md': minimalAgentMd,
  });
}
```

The parser is the same one used for user teams; the only difference is where the bytes come from. There is no special-case "this is the built-in" code path.

| Property | Value |
|---|---|
| Roles | 1 (`general`) |
| Leader | `general-1` (auto-subscribes to `leader.prompt` in the team's view — the platform prefixes `{team_id}.leader.prompt` on the bus per ADR 19; no `subscribe:` in frontmatter, so no domain topics) |
| Domain topics | None (no subscription graph; the leader is the only agent) |
| Tools | `bash`, `read_file`, `write_file` (plus auto-registered `notify`) |
| Model | Inherited from merged settings — see "Model" below |
| System prompt | A general-purpose assistant prompt — see "Built-in System Prompt" below |

### Built-in System Prompt

```
You are a general-purpose assistant running inside the Jie (界) platform. The user will
send you prompts. Use your tools (`bash`, `read_file`, `write_file`, `notify`) to help them.
If the user wants a multi-agent workflow (a team of specialized agents), tell them to
install a custom team blueprint — running solo is a fallback, not the intended mode for
complex work.
```

The system prompt is intentionally short: it establishes identity and points users at the right next step for richer workflows.

## User-Installed Override

A user can place `TEAM.md` and `general.md` (the minimal-team shape) at `~/.jie/teams/minimal/` (global) or `.jie/teams/minimal/` (project-local, walking up from CWD). Once installed, the user-installed `minimal` team takes precedence over the platform's built-in. The override is byte-for-byte the same `.md` format as the built-in; the loader does not distinguish "platform's built-in" from "user's copy" once the bytes are in hand.

```
.jie/teams/minimal/
 TEAM.md      # frontmatter: leader
 general.md   # agent definition (name, optional model, tools, optional subscribe, system_prompt)
```

## Model

The minimal team does not pin a model. The leader's `(provider, modelId)` is resolved from the user's merged settings at startup, following the chain in `10-configuration.md` "Model Resolution".

The platform performs a startup pre-check (run by `startJie`): every agent in the blueprint must resolve to a concrete model before any agent is constructed. If any agent fails to resolve, startup exits 1 with one error message listing every unresolved agent and the remediation steps. Per-agent fallback failures do not leak into the LLM call — a missing model is a startup error, not a runtime one.

Users who want a different model globally run `jie model <provider>/<modelId>` (or edit `~/.jie/settings.json` directly). Users who want a different model for the minimal team specifically can install their own `general.md` (which can pin a model in frontmatter) and place it at one of the standard paths.

## Behavior

The leader processes a single user prompt per turn. There are no domain topics, so no inter-agent coordination happens. The leader's tools (`bash`, `read_file`, `write_file`) are available for direct work in the workspace — no artifact store is exposed because there are no peers to coordinate with.

## Why a Built-in Fallback

A user can run `jie` in any directory with minimal setup: run `jie login` (once, for credentials) and `jie model <provider>/<id>` (once, to pick a model). After those two commands, the platform always has a runnable configuration — a single binary, a single command, a working agent, even if the user has not created any project files or installed any team. The built-in minimal team is the last-resort guarantee: as long as a model is configured, `jie` will run.

The login + model step is the *only* setup the platform requires; everything else is optional. Team selection is a runtime choice (via `jie team <id>`, `/team <id>`, or `--team <id>`); without a selection, the platform falls back to the built-in minimal team.
