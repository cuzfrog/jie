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

The v1-scenarios test calls a real LLM. The endpoint, provider id,
and model id are declared in `tests/e2e/fixtures/models.json`. The
test copies this fixture into the test workspace's `.jie/` and runs
the user scenarios end-to-end through the CLI's `ModelRegistry` —
the same path the user takes via `.jie/models.json` (issue #20).

```sh
bun test tests/e2e/v1-scenarios.test.ts
```

If the LLM endpoint in the fixture is unreachable, the test fails
with a network error. To point the test at a different endpoint,
edit `tests/e2e/fixtures/models.json`.

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
respond with the literal marker `TEAM_ONE` / `TEAM_TWO` so the
assertions are robust to LLM variability.
