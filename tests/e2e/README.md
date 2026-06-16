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
| `JIE_E2E_LLM_API_KEY` | `not-needed` | API key sent in the `Authorization` header. Interpolated into `.jie/models.json`'s `apiKey` field via `$JIE_E2E_LLM_KEY`. |

For the dev environment (LM Studio at `http://192.168.1.6:12345` exposing
`qwen3.5-2b`):

```sh
JIE_E2E_LLM_BASE_URL=http://192.168.1.6:12345 bun test tests/e2e/v1-scenarios.test.ts
```

## Test design notes

**Hermetic HOME.** The test redirects `process.env.HOME` to a tmp
dir for the duration of each test, so the user's real
`~/.jie/auth.json` and `~/.jie/settings.json` are never consulted.
The afterEach restores the original HOME.

**Project-scoped config.** Each test writes a `.jie/models.json`
and a `.jie/settings.json` inside the test workspace (the project
root). These are what the platform's `ModelRegistry` reads. The
test does not consume `~/.pi/agent/models.json` — it constructs
its own provider config in the test workspace, which keeps the
test self-contained.

**`models.json` resolution.** The test relies on issue #20's
`ModelRegistry` to resolve the local LLM provider. The `apiKey`
field uses `$JIE_E2E_LLM_KEY` env interpolation, which the
registry resolves at load time. This is the same path the user
takes to set up a custom provider: write `.jie/models.json` with
`apiKey: "$MY_KEY"` and the env var holds the secret.

**Deterministic prompts.** Scenario 2 instructs the agent to
respond with the literal marker `TEAM_ONE` / `TEAM_TWO` so the
assertions are robust to LLM variability.
