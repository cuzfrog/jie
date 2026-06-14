# ADR 23: Remove Environment-Variable API Key Resolution in v1

## Status
Accepted 2026-06-13. Closes Group 3 of fresh review pass 4.

## Context

`10-configuration.md` "Credentials Resolution Order" defines a 4-step chain for resolving an LLM provider's API key at call time:

| Order | Source | Notes |
|---|---|---|
| 1 | `jie --api-key <key>` flag | One-shot, single run. |
| 2 | `~/.jie/auth.json` entry for the provider | Set by `jie login` or `jie logout`-cleared. |
| 3 | Provider's environment variable | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. |
| 4 | Custom provider keys from `~/.jie/models.json` | Day 2 concern. |

Steps 3 (env vars) and 4 (custom `models.json`) are the soft fallbacks when the user has not run `jie login`. Step 1 (`--api-key`) and step 2 (`auth.json`) are platform-owned: step 1 writes step 2.

The fresh review pass 4 surfaced that the env-var step is unjustified in v1:

- **The `auth.json` file is the platform's intent.** `jie login` writes it. `jie --api-key` writes it. `jie logout` clears it. The user's chosen credential lives in one place. The platform's "Auth file beats env" rule (per `10-configuration.md`) explicitly documents the intent: a `jie login`-written key wins over a stale env var from a service supervisor.
- **The env-var step adds complexity for a Day-1 feature no one asked for.** `pi-ai`'s `getEnvApiKey(provider)` is a one-liner; the platform's `getApiKey` adapter adds another seam; the troubleshooting docs reference env-var names that change per provider. All of this exists to support the case where the user never ran `jie login` but happens to have a stray `ANTHROPIC_API_KEY` in their shell.
- **`jie --api-key <key>` already covers the "I have a key in my shell" case.** The user copies it from the shell, runs `jie --api-key sk-ant-...` once, and the key is in `auth.json` permanently. No env-var round-trip needed.
- **The "Auth file beats env" rule was always a workaround.** A user who rotated credentials via the CLI but still has a stale env var in their supervisor was treated as "auth.json wins, but env still works as a fallback". Removing the fallback forces a single source of truth and makes the troubleshooting story one error message shorter.

The user confirmed on 2026-06-13: *"Let's remove the function that api-key can be provided by environment variables. With `--api-key` we don't need environment variable parsing anymore."*

## Decision

The env-var step (step 3) is removed from the credentials resolution chain in v1. The chain becomes:

| Order | Source | Notes |
|---|---|---|
| 1 | `jie --api-key <key>` flag | Writes `auth.json` for the resolved provider. The flag is the inlined `jie login --provider <id> --api-key <key>` flow. |
| 2 | `~/.jie/auth.json` entry for the provider | Set by `jie login`, `jie --api-key`, or `jie logout`-cleared. Sole credential source at LLM-call time. |
| 3 | Custom provider keys from `~/.jie/models.json` | Day 2 concern (unchanged). |

`auth.json` is now the **sole** credential source in v1. The platform's `getApiKey(provider)` returns the value from the `auth.json` entry for `provider`, or `undefined` (which surfaces as a credential error at LLM-call time). The platform no longer calls pi-ai's `getEnvApiKey(provider)`; that function is not imported.

The "Provider → environment variable mapping" table in `10-configuration.md` is removed. References to `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. throughout the spec are removed.

The `jie --api-key` flag's "one-shot, single run" wording in `10-configuration.md` is rewritten. The flag is no longer "one-shot" — it writes `auth.json` and the entry persists. The flag is a shortcut for `jie login --provider <id> --api-key <key>`, designed for non-interactive use (CI / scripts). The CLI's wording changes from "the next `jie` / `jie -p` invocation in this process tree reads the just-written credential" to "the rest of this command's flow reads the just-written credential" — there is no "next invocation" in a single command line; the same process continues with the remaining flags after writing.

`12-installation.md` is updated:
- "the user runs `jie login` interactively (or sets an env var) before the first `jie` invocation" → "the user runs `jie login` interactively before the first `jie` invocation".
- "Run `jie login` for the resolved provider, or set the provider's env var" (Troubleshooting) → "Run `jie login` for the resolved provider".

`06-agent-model.md` "Agent Construction" `getApiKey(provider)` row is updated: "Resolves via pi-ai's `getEnvApiKey(provider)`" → "Returns the API key from the resolved `auth.json` (per ADR 23). The platform no longer reads provider environment variables — `auth.json` is the sole credential source."

## Rationale

- **One source of truth.** A user's API key lives in `auth.json`. Period. No "what env var did I forget to unset?" debugging. No "auth.json says one key but my shell has another" footgun.
- **The flag already covers the env-var use case.** Anyone with a `sk-...` token in their shell can run `jie --api-key <token>` once. The persistence is a feature, not a bug — the user does not have to set the env var on every invocation.
- **The platform's "Auth file beats env" rule is no longer needed.** It existed to handle the case where the user rotated credentials via `jie login` but a service supervisor still exported the old env var. With the env-var step removed, that case is impossible — the env var is never read.
- **The pi-ai dep is not affected.** `getEnvApiKey` is a pi-ai function; Jie never used it directly. Removing the import is a one-line change in the platform's `getApiKey` adapter. No upstream impact.
- **The v1 surface shrinks.** One provider → env-var mapping table gone. A dozen references to "or set the env var" prose gone. The troubleshooting table has one fewer row. The platform's `getApiKey` is a one-liner that returns a string or `undefined`.

## Consequences

- `10-configuration.md` "Credentials Resolution Order" — step 3 (env var) is removed. The chain is now 3 steps. The "Provider → environment variable mapping" table is removed.
- `10-configuration.md` "Auth: `auth.json`" — the "The `key` field supports command execution (`!cmd`), env interpolation (`$ENV_VAR` / `${ENV_VAR}`), and literal values" sentence is removed; the `auth.json` `key` field is now a plain string in v1. (The interpolation grammar was a pi-ai concern that is no longer reachable.)
- `10-configuration.md` "Auth file beats env" rule is removed (no env to beat).
- `10-configuration.md` "Provider Configuration (v1)" — unchanged.
- `10-configuration.md` "Auth.json Validation" — unchanged.
- `06-agent-model.md` "Agent Construction" `getApiKey(provider)` row — updated to "Returns the API key from the resolved `auth.json`".
- `06-agent-model.md` "AgentBody" class signature — unchanged.
- `ui/cli.md` `jie --api-key <key>` — "next invocation" wording is replaced with "the rest of this command's flow". The behavior (write `auth.json`, optionally continue with `-p`) is unchanged. The "one-shot, single run" label is removed.
- `12-installation.md` — env-var fallback mentions are removed; the `jie login` flow is the only setup path.
- `12-installation.md` "Troubleshooting" — the "no API key found" row's "or set the provider's env var" mention is removed.
- `addrs/15-platform-entry-function.md` `StartJieOptions` — unchanged (no `apiKey` field; the flag is a CLI-side concern that writes `auth.json` before `startJie` runs).
- The platform no longer imports `@earendil-works/pi-ai`'s `getEnvApiKey`. The adapter is `(provider) => Promise<string | undefined>` returning the `auth.json` value.
- The `auth.json` `key` field format in v1: plain string. No `!cmd` / `$ENV_VAR` interpolation. Day 2+ may add interpolation if a use case appears; v1 is plain.
- Cross-platform consistency: Linux, macOS, WSL2 all behave the same. There is no longer a "but what if the user's shell exports `OPENAI_API_KEY`?" scenario.
- Out of scope (deferred): `models.json` (Day 2) — unchanged. Per-provider custom endpoints (Day 2) — unchanged.

## References

- Closes Group 3 of fresh review pass 4 (`review-tracker.md`).
- Modifies: `10-configuration.md` (resolution chain, env-var mapping, auth.json), `06-agent-model.md` (`getApiKey` row), `ui/cli.md` (`jie --api-key` flow), `12-installation.md` (env-var mentions, troubleshooting).
- Confirms the user's instruction from 2026-06-13: env-var resolution is removed; `auth.json` is the sole v1 credential source.
