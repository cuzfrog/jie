# Setup-Assistant Team — Platform's Built-in Fallback

The setup-assistant team is the platform's built-in fallback. It carries a single `general` role and is responsible for describing Jie to the user, helping set up Jie, installing teams and agents, and answering setup and help questions. It ships as two `.md` files inside the platform package at `src/platform/team/setup-assistant/`, loaded at module-load time via `import ... with { type: "text" }` and parsed by the same parser as user teams. It is the last-resort fallback guaranteeing the platform always has something to run when no user team is selected; a user copy at `~/.jie/teams/setup-assistant/` or `.jie/teams/setup-assistant/` overrides it.

## Built-in (Shipped with the Platform)

The platform's built-in setup-assistant team lives at `src/platform/team/setup-assistant/`:

```
team/setup-assistant/
  TEAM.md      # frontmatter: leader: general, description: Jie setup and help
  general.md   # role: general, tools: [bash, read_file, write_file, edit_file, memory]
```

These two files are the **last-resort fallback** in the team selection chain — used only when no user-installed team is selected (no `--team` flag, no `defaultTeam` in settings, and no user team manifests available at the standard paths). The parser's `loadSetupAssistantTeam()` reads them via `import` attributes (bun 1.3+) at module-load time:

```typescript
// src/platform/team/parser.ts
import { BUILTIN_SETUP_ASSISTANT_TEAM_ID, type TeamBlueprint } from "./types";
import SETUP_ASSISTANT_TEAM_MD from "./setup-assistant/TEAM.md" with { type: "text" };
import SETUP_ASSISTANT_GENERAL_MD from "./setup-assistant/general.md" with { type: "text" };

export function loadSetupAssistantTeam(): TeamBlueprint {
  return parseTeamFromManifests(
    { "TEAM.md": SETUP_ASSISTANT_TEAM_MD, "general.md": SETUP_ASSISTANT_GENERAL_MD },
    { teamId: BUILTIN_SETUP_ASSISTANT_TEAM_ID },
  );
}
```

The parser is the same one used for user teams; the only difference is where the bytes come from. There is no special-case "this is the built-in" code path.

|| Property | Value |
|---|---|---|
|| Roles | 1 (`general`). The role id is the filename stem (`general.md` → role `general`). |
|| Leader | `general-1` (the only agent; user prompts reach it via the `user.prompt` topic. No `subscribe:` in frontmatter, so no domain topics.) The agent key is `<role>-1`. |
|| Domain topics | None (no subscription graph; the leader is the only agent) |
|| Tools | `bash`, `read_file`, `write_file`, `edit_file`, `memory` |
|| Model | Inherited from merged settings — see "Model" below |
|| System prompt | A setup and help prompt — see "Built-in System Prompt" below |

### Built-in System Prompt

```
You are the Jie (界) setup assistant. Describe Jie to the user, help them set up Jie, install teams and agents with `jie team add`, configure mcp and code-lens, and answer setup and help questions. Use your tools to inspect the system, run `jie` commands, and edit configuration files. When the user is ready to work, tell them to switch to another team with `/team <id>` or `/team setup-assistant` to return here.
```

The system prompt establishes the setup-assistant identity and points users at the right next steps for richer workflows.

## User-Installed Override

A user can place `TEAM.md` and `general.md` (the setup-assistant-team shape) at `~/.jie/teams/setup-assistant/` (global) or `.jie/teams/setup-assistant/` (project-local, walking up from CWD). Once installed, the user-installed `setup-assistant` team takes precedence over the platform's built-in. The override is byte-for-byte the same `.md` format as the built-in; the parser does not distinguish "platform's built-in" from "user's copy" once the bytes are in hand.

```
.jie/teams/setup-assistant/
 TEAM.md      # frontmatter: leader
 general.md   # agent definition (name, optional model, tools, optional subscribe, system_prompt)
```

## Model

The setup-assistant team does not pin a model. The leader's `(provider, modelId)` is resolved from the user's merged settings at startup, following the chain in `10-configuration.md` "Model Resolution".

Model resolution happens at team load: if no model is configured (the soul pins none and settings define no `defaultProvider`/`defaultModel`), load fails with `NO_MODEL_ERROR` and the CLI exits 1; a model string that fails to resolve throws `MODEL_UNRESOLVED` naming the model and role — the single-agent team's only role is its leader, so an unresolvable default model fails the load rather than producing a leaderless team. A missing model is thus a load-time error, not a runtime one.

Users who want a different model globally run `jie model <provider>/<modelId>` (or edit `~/.jie/settings.json` directly). Users who want a different model for the setup-assistant team specifically can install their own `general.md` (which can pin a model in frontmatter) and place it at one of the standard paths.

## Behavior

The leader processes a single user prompt per turn. There are no domain topics, so no inter-agent coordination happens. The leader's tools (`bash`, `read_file`, `write_file`, `edit_file`, `memory`) are available for direct work in the workspace — no artifact store is exposed because there are no peers to coordinate with.

## Why a Built-in Fallback

A user can run `jie` in any directory with minimal setup: run `jie login` (once, for credentials) and `jie model <provider>/<id>` (once, to pick a model). After those two commands, the platform always has a runnable configuration — a single binary, a single command, a working agent, even if the user has not created any project files or installed any team. The built-in setup-assistant team is the last-resort guarantee: as long as a model is configured, `jie` will run.

The login + model step is the *only* setup the platform requires; everything else is optional. Team selection is a runtime choice (via `jie team <id>`, `/team <id>`, or `--team <id>`). When other teams are installed, the platform prefers the first installed user team; the help panel and footer hint at `/team setup-assistant` for setup and help. The built-in `setup-assistant` team can always be reached explicitly with the same command.
