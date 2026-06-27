# End-to-End Tests

This directory contains the v1 e2e tests for the jie platform, validating
the full stack against the v1 acceptance surface from
`doc/specs/jie-platform/00-user-scenarios.md` and the Event-Order
Contract from `doc/addrs/22-event-order-contract.md`.

## Test files

| File | LLM required | What it tests |
|------|--------------|---------------|
| `v1-scenarios.test.ts` | Yes | The three v1 user scenarios (no team, two teams, first-time setup). |

## Running

### Real-LLM tests

The v1-scenarios test calls a real LLM. The endpoint, api key, and
model id are declared as `${...}` env-var placeholders in
`tests/e2e/fixtures/models.json` and resolved by `load-models.ts`.
The test copies the resolved fixture into the test workspace's
`.jie/` and runs the user scenarios end-to-end through the CLI's
`ModelRegistry` — the same path the user takes via
`.jie/models.json` (issue #20).

Required env vars (the test hard-fails at module load if any are
missing — there is no skip-on-unreachable path):

| Var | Meaning |
|-----|---------|
| `JIE_E2E_BASE_URL` | OpenAI-completions base URL (e.g. `http://192.168.1.6:12345/v1`, `https://integrate.api.nvidia.com/v1`) |
| `JIE_E2E_API_KEY` | Bearer token (`not-needed` for LM Studio; `$NVIDIA_API_KEY` for CI) |
| `JIE_E2E_MODEL` | Model id (e.g. `qwen3.5-2b`, `nvidia/nemotron-3-nano-30b-a3b`) |

### Local dev (LM Studio)

Source `setenv` from the repo root, then run the e2e script:

```sh
. ./setenv
bun run test:e2e
```

`setenv` exports the three `JIE_E2E_*` vars pointing at the
machine's local LLM (LM Studio by default).

### CI (NVIDIA)

The `test` workflow runs e2e against `integrate.api.nvidia.com`
using the repo secret `NVIDIA_API_KEY`. PRs from forks skip the
e2e step (the secret is not exposed to fork PRs); pushes and
in-repo PRs run e2e end-to-end.

```sh
JIE_E2E_BASE_URL=https://integrate.api.nvidia.com/v1 \
JIE_E2E_API_KEY=$NVIDIA_API_KEY \
JIE_E2E_MODEL=nvidia/nemotron-3-nano-30b-a3b \
bun run test:e2e:ci
```

## Test design notes

**Hermetic HOME.** Each test redirects `process.env.HOME` to a tmp
dir, so the user's real `~/.jie/auth.json` and
`~/.jie/models.json` are never consulted. The `afterEach` restores
the original HOME.

**Self-contained fixture.** The test reads
`tests/e2e/fixtures/models.json` once at module load and copies
it into the test workspace. The test does not depend on the
project's own `.jie/models.json` — the fixture is a data file
shipped with the test, so the e2e scenarios can be exercised
independently of any local LLM config the developer has set up.

**Project-scope writes only.** The scenario tests write the
fixture to `{workspace}/.jie/models.json` (project scope). The
per-scope merge semantics and user-scope fallback are covered by
the platform's unit tests (`load-models.test.ts`,
`registry.test.ts`); the e2e test only verifies the end-to-end
flow against a real LLM.

**Deterministic prompts.** Scenario 2 instructs the agent to
respond with the literal marker phrase assigned per team so the
assertions are robust to LLM variability.
