# Minimal Team — Built-in Fallback Blueprint

The minimal team is the simplest possible `team-blueprint`: one general-purpose leader agent with default tools. It ships in the `jie-team` package as a directory of `.md` files (TEAM.md + general.md) and is used as the **fallback team** when no user team is configured. The fallback is reached only by omitting `team_id` from config — the platform then defaults `team_id` to `"minimal"` and looks it up at the standard paths. See ADR 12 for how jie-team's `postinstall` populates those paths on first install.

## Composition

| Property | Value |
|---|---|
| Roles | 1 (`general`) |
| Leader | `general-1` (auto-subscribes to `leader.prompt`) |
| Domain topics | None (no subscription graph; the leader is the only agent) |
| Tools | `bash`, `read_file`, `write_file` (plus auto-registered `notify`) |
| Model | Inherited from the user's global default — see "Model" below |
| System prompt | A general-purpose assistant prompt — see "System Prompt" below |

## Model

The minimal team does not pin a model. The leader's `(provider, modelId)` is resolved from the user's global default at startup, following the chain in `10-configuration.md` "Model Resolution".

The platform performs a startup pre-check: every agent in the blueprint must resolve to a concrete model before any agent is constructed. If any agent fails to resolve, startup exits 1 with one error message listing every unresolved agent and the remediation steps. Per-agent fallback failures do not leak into the LLM call — a missing model is a startup error, not a runtime one.

The built-in minimal team accepts no per-team model overrides. Users who want a different model globally run `jie model <provider>/<modelId>` (or edit `~/.jie/settings.json` directly). Users who want a different model for a specific user team override the relevant agent in that team's `.md` frontmatter — see `05-agent-model.md`.

## System Prompt

The `general` agent's system prompt:

```
You are a general-purpose assistant running inside the Jie (界) platform. The user will
send you prompts. Use your tools (`bash`, `read_file`, `write_file`, `notify`) to help them.
If the user wants a multi-agent workflow (a team of specialized agents), tell them to
install a custom team blueprint — running solo is a fallback, not the intended mode for
complex work.
```

The system prompt is intentionally short: it establishes identity and points users at the right next step for richer workflows.

## Behavior

The leader processes a single user prompt per turn. There are no domain topics, so no inter-agent coordination happens. The leader's tools (`bash`, `read_file`, `write_file`) are available for direct work in the workspace — no artifact store is exposed because there are no peers to coordinate with.

## Loader Location

The minimal team is shipped in the `jie-team` package as a directory of `.md` files:

```
packages/jie-team/teams/minimal/
  TEAM.md      # frontmatter: leader
  general.md   # agent definition (model, tools, subscribe, system_prompt)
```

`jie-team`'s `postinstall` script (and the CLI's `jie team install` command) copies these files to `~/.jie/teams/minimal/` on first install. The platform's team-blueprint loader, when asked to resolve a team with no `team_id` set, defaults to `team_id = "minimal"` and looks up the team at the standard paths (project-local `.jie/teams/minimal/`, then user-level `~/.jie/teams/minimal/`) — see `10-configuration.md` "Team Resolution".

The platform does not import jie-team in any form. The minimal team is reached the same way as any other user team: by name, at a standard filesystem path. See ADR 12 for the package-boundary principle.

## Why a Built-in Fallback

A user can run `jie` in any directory with minimal setup. After `bun install -g @cuzfrog/jie` (which triggers jie-team's postinstall and copies the minimal team to `~/.jie/teams/minimal/`), then `jie login` (once, for credentials) and `jie model <provider>/<id>` (once, to pick a model), the platform always has a runnable configuration — a single binary, a single command, a working agent, even if the user has not created any project files yet. The login + model step is the *only* setup the platform requires; everything else is optional.
