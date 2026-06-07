# Minimal Team — Built-in Fallback Blueprint

The minimal team is the simplest possible `team-blueprint`: one general-purpose leader agent with default tools. It ships in the `jie-team` package as a hardcoded blueprint (not as a `.md` directory) and is used as the **fallback team** when no user team is configured. The fallback is reached only by omitting `team_id` from config — there is no opt-in keyword to select it explicitly.

## Composition

| Property | Value |
|---|---|
| Roles | 1 (`general`) |
| Leader | `general-1` (auto-subscribes to `leader.prompt`) |
| Domain topics | None (no subscription graph; the leader is the only agent) |
| Tools | `bash`, `write_artifact`, `read_artifact` (plus auto-registered `notify`) |
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
send you prompts. Use your tools (`bash`, `read_artifact`, `write_artifact`, `notify`) to
help them. If the user wants a multi-agent workflow (a team of specialized agents), tell
them to install a custom team blueprint — running solo is a fallback, not the intended mode
for complex work.
```

The system prompt is intentionally short: it establishes identity and points users at the right next step for richer workflows.

## Behavior

The leader processes a single user prompt per turn. There are no domain topics, so no inter-agent coordination happens. The leader's tools (`bash`, `write_artifact`, `read_artifact`) are available for direct work in the workspace.

## Loader Location

The minimal team is exported from the `jie-team` package as a TypeScript module:

```typescript
// packages/jie-team/minimal.ts
export const minimalTeamBlueprint: TeamBlueprint = {
  name: "minimal",
  // ... TEAMD.md-equivalent + agent definitions
};
```

The platform imports this directly when no user team is found. No file-system lookup is involved for the fallback path.

## Why a Built-in Fallback

A user can run `jie` in any directory with minimal setup. After `jie login` (once, for credentials) and `jie model <provider>/<id>` (once, to pick a model), the platform always has a runnable configuration — a single binary, a single command, a working agent, even if the user has not created any project files yet. The login + model step is the *only* setup the platform requires; everything else is optional.
