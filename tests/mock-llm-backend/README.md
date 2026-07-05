# Chat-Completions Stub

HTTP stub for the `openai-completions` chat-completions API. Returns a
deterministic SSE stream chosen by registered matchers. The same
`POST /v1/chat/completions` shape the platform normally hits, with a
control plane on the side for tests to register expectations and read
the call log.

## Endpoints

| Method | Path                  | Purpose                                       |
|--------|-----------------------|-----------------------------------------------|
| POST   | `/v1/chat/completions`| The platform's chat-completions endpoint.     |
| POST   | `/mock/expectations`  | Register rules: `{ expectations: Expectation[] }`. Resets the call log. |
| DELETE | `/mock/expectations`  | Clear rules + call log.                       |
| GET    | `/mock/calls`         | Read call log.                                |
| GET    | `/health`             | Liveness probe.                               |

Default port: **12346**.

## Start the server

```sh
bun run mock:start
```

Long-running; reuse across many `bun test` runs. `Ctrl+C` to stop.

## Install expectations and run the e2e suite

Each test suite that exercises the stub imports a companion
`*.llm.ts` (a default-exported `Expectation[]`) and calls
`loadMockExpectations(expectations)` once in `beforeAll`. The helper
is a no-op when `JIE_E2E_BASE_URL` is not the stub port, so the suite
runs unchanged against a real backend.

```ts
import { loadMockExpectations } from "../../mock-llm-backend";
import expectations from "./v1-scenarios.llm.ts";

beforeAll(async () => {
  await assertLlmReachable();
  await loadMockExpectations(expectations);
});
```

Run the suite with the stub URL:

```sh
bun run mock:start   # in one shell
bun run test:e2e:mock
```

## Matchers

Each `Expectation` has a `match: MatchRule` and a `responseChunks`
sequence. Matchers are evaluated in registration order; the first rule
whose matchers all hold wins.

| Field                  | What it requires                                                |
|------------------------|-----------------------------------------------------------------|
| `lastUserContains`     | Substring in the last user-role message's text.                 |
| `anyUserContains`      | Substring anywhere in any user-role message.                    |
| `anySystemContains`    | Substring in the joined system message text.                    |
| `toolName`             | The given tool name appears in the request's `tools` list.      |
| `model`                | Exact `model` field in the request body.                        |
| `minAssistantMessages` | At least this many `role: "assistant"` entries in `messages`.   |

Response chunks describe the SSE stream:

| Kind        | Shape                                                                            |
|-------------|----------------------------------------------------------------------------------|
| `text`      | `{ kind: "text", delta: string }` — content chunk                                |
| `tool_call` | `{ kind: "tool_call", id, name, argumentsChunks: string[] }` — name first, then per-token arguments |
| `finish`    | `{ kind: "finish", reason: "stop" \| "length" \| "tool_calls" }`                 |

Every response starts with a role-only chunk and ends with the standard
`data: [DONE]\n\n` sentinel.

### Default on no-match

A request with no matching rule returns **HTTP 500** with an
OpenAI-style error envelope so the failure surfaces as a normal API
error:

```json
{ "error": { "message": "no expectation matched", "type": "mock_no_match", "param": null, "code": null } }
```

## SDK

```ts
import { MockClient, loadMockExpectations } from "./mock-llm-backend";
import expectations from "./v1-scenarios.llm.ts";

// In a test's beforeAll — no-op unless JIE_E2E_BASE_URL points at the stub.
await loadMockExpectations(expectations);

// Or, when you need finer control:
const c = new MockClient();
await c.registerExpectations([
  { match: { lastUserContains: "hi" }, responseChunks: [{ kind: "text", delta: "world" }, { kind: "finish", reason: "stop" }] },
]);
// ...drive the platform...
const calls = await c.getCalls();
await c.assertConsumedAll(rules); // throws if any rule was never matched
```

## File map

| File              | Purpose                                                  |
|-------------------|----------------------------------------------------------|
| `server.ts`       | `Bun.serve` entry; routes, module-level state.           |
| `expectations.ts` | Pure matcher + SSE renderer (no I/O).                    |
| `client.ts`       | `MockClient` SDK + `loadMockExpectations` helper.        |
| `index.ts`        | Barrel re-exports.                                       |
| `*.test.ts`       | Unit + in-process HTTP smoke tests.                      |
