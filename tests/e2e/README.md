# End-to-End Tests

This directory contains the v1 e2e tests for the jie platform, validating
the full stack against the v1 acceptance surface from
`doc/specs/jie-platform/00-user-scenarios.md` and the Event-Order
Contract from `doc/addrs/22-event-order-contract.md`.

## Test files

| File | LLM required | What it tests |
|------|--------------|---------------|
| `event-order.test.ts` | No | Body-side alternation and bus-side in-order delivery from ADR 22. Uses stub agents. |
| `memory-roundtrip.test.ts` | No | First `startJie` call persists messages; second call with `continueLastSession: true` restores them into the agent's state. |
| `v1-scenarios.test.ts` | Yes | The three v1 user scenarios (no team, two teams, first-time setup). |

## Running

### Stub tests (no LLM needed)

```sh
bun test tests/e2e/event-order.test.ts tests/e2e/memory-roundtrip.test.ts
```

### Real-LLM tests

The v1-scenarios test calls a real LLM. It is gated by env:

| Env var | Default | Meaning |
|---------|---------|---------|
| `JIE_E2E_LLM_BASE_URL` | (unset → tests skip) | LLM base URL, e.g. `http://192.168.1.6:12345`. The test appends `/v1` to this. |
| `JIE_E2E_LLM_API_KEY` | `not-needed` | API key sent in the `Authorization` header. |
| `JIE_E2E_LLM_PROVIDER` | `lm-studio` | Provider id used in `settings.json` and `auth.json`. |
| `JIE_E2E_LLM_MODEL_ID` | `qwen3.5-2b` | Model id used in the prompt and as the model's `id`. |

For the dev environment (LM Studio at `http://192.168.1.6:12345` exposing
`qwen3.5-2b`):

```sh
JIE_E2E_LLM_BASE_URL=http://192.168.1.6:12345 bun test tests/e2e/v1-scenarios.test.ts
```

The dev environment is wired up via the `lm-studio` provider in
`~/.pi/agent/models.json`. The e2e test does not consume that file
directly; it constructs a `Model` object from the env-var config
above. This keeps the test hermetic — the user's actual settings
file is not consulted.

## Test design notes

**Deterministic prompts.** Scenario 2 in `v1-scenarios.test.ts` tells
the agent to respond with a fixed marker (`TEAM_ONE` / `TEAM_TWO`),
not to summarize a story. The test asserts the marker appears in
stdout. This is robust to LLM variability: a 2b model may not
produce a coherent story, but it can follow "respond with this
literal text".

**Why the test bypasses pi-ai's model registry.** The test injects
the `Model` via `PrintHooks.resolveModel` rather than relying on
pi-ai's `getModel()`. This is because pi-ai's `getModel` reads a
hardcoded list of well-known providers and models; the LM Studio
local model is not in that list. The `resolveModel` hook is the
v1-extensibility seam for adding custom models without forking
pi-ai.

**HERMETIC HOME.** The test redirects `process.env.HOME` to a tmp
dir for the duration of each test, so the user's real
`~/.jie/auth.json` and `~/.jie/settings.json` are never consulted.
The afterEach restores the original HOME.
