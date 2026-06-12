# Review Tracker — jie-platform

> Open implementation-grade gaps. Resolved history lives in `./addrs/`. Resuming tmr; nothing in flight.

## Resolved

- **Group K** closed 2026-06-11. Spec-skeleton, MVP scope, supervisor removal, built-in `.md` format, storage layering. ADRs: `14-storage-layer-abstractions.md`, `15-platform-entry-function.md`, `16-builtin-minimal-team-as-manifest-files.md`, `17-v1-mvp-scope.md`. Spec changes: new `04-storage.md`; `04-artifact-store.md` → `05-artifact-store.md` (rewritten, domain-only); `05-agent-model.md` → `06-agent-model.md`; `00-overview.md` glossary; `08-memory.md`, `09-deployment.md`, `10-configuration.md`, `12-installation.md`, `ui/tui.md`, `monorepo-structure.md`, `minimal-team.md` all updated for the new entry-function / no-supervisor / built-in-`.md` shape.
- **Group L** closed 2026-06-11. Config format (JSON for config, `.md`+YAML for content per pi convention). Runtime dependencies (`@earendil-works/pi-agent-core@0.79.1`, `@earendil-works/pi-ai@0.79.1`, `typebox@1.1.38`, `yaml@2.9.0`; bun built-ins for the rest; no commander/yargs/lodash). MCP client deferred to Day 2 (added to ADR 17 §"MVP scope statement"). pi-agent 0.79.1 API drift corrected (`BeforeToolCallContext` shape, `BeforeToolCallResult.block/reason`). Spec changes: `mcp.yaml` → `mcp.json` (11 places); new "File-Format Convention" in `10-configuration.md`; new "jie-platform Runtime Dependencies" in `monorepo-structure.md`; ADR 17 §"MVP scope" amended; `10-configuration.md` "MCP Server Configuration" marked Day 2; `09-deployment.md` startup step 5 marked Day 2; `06-agent-model.md` "Tool Telemetry" / "pi-agent Integration Contract" corrected for 0.79.1; `pi-agent-api-reference.md` corrected for 0.79.1. (The "JSON for config" and "runtime deps" items were initially drafted as ADRs 18/19, but those are not architecturally significant and were folded into spec/prose per the user's "not an ADR" feedback.)

## Open — Group M (resuming tmr)

Group M is the **implementation-level spec clarifications** surfaced by the implementer pass. None are architecturally significant enough to warrant an ADR; they are spec corrections and small gap-fills. M4–M10 are settled by existing spec/ADR prose and only need the implementer to follow them. M1–M3 are spec corrections to write.

| # | Item | Action |
|---|---|---|
| **M1** | Synthetic user message format for `leader.prompt` is unspecified. Spec gives `[{source_agent_key} on '{topic}']: {prompt}` for `notify`/domain events, but `leader.prompt` payload is `{prompt: string}` (no `source`). **Proposal:** format as `[user]: {prompt}`. | Spec correction in `06-agent-model.md` "On receipt..." sentence. |
| **M2** | `agent.tool.result` `output: string` JSON serialization is ambiguous. Spec says "JSON-serialized" with 4 KiB middle-truncation, but doesn't say *what* is serialized. **Proposal:** serialize the whole `ToolResult = { content, details?, terminate? }` so observers get both LLM-visible text and structured `details`. | Spec clarification in `03-event-system.md` "Tool Telemetry" + `06-agent-model.md` "Tool Adaptation". |
| **M3** | TypeBox API drift. Spec says `TypeBox.Value.Create(parameters, raw)` + `TypeBox.Value.Validate(parameters, result)`. Current TypeBox API is `Value.Check` (no `Create`/`Validate`). **Proposal:** use `Value.Check(parameters, raw)`; throw tool-result error on `false`. No coercion in v1. | Spec correction in `06-agent-model.md` "Tool Adaptation to pi-agent". |
| M4 | Body's "busy" / "idle" transition. Spec says "If currently processing a prior message, the incoming message waits until the agent is idle." Implementation: body is "busy" from `agent.prompt()` until `agent_end`. The body's prompt queue accumulates `UserMessage`s during that window. | Implementation note; no spec change. Settled by `06-agent-model.md` "Prompt Ingress & Queuing". |
| M5 | `agent.queue.update` snapshot mechanism. Spec says body publishes on enqueue and dequeue with `{prompts: string[]}`. Implementation: on enqueue, extract text from `UserMessage.content` (string or first text part of array) and append. On dequeue, remove head. | Implementation note; no spec change. |
| M6 | `agent.idle` startup publish ordering. ADR 13 settled: subscribe → publish startup `agent.idle` → start message queue. Body also publishes `agent.idle` on every `agent_end`. Single helper `body.publishIdle()` called from both points. | Implementation note; no spec change. |
| M7 | Agent key collision WARN. `08-memory.md` says platform surfaces a startup WARN if freshly-loaded team's `agent_key`s would collide with existing `memory_turns` rows for the current `session_id`. Implementation: query `SELECT DISTINCT agent_key FROM memory_turns WHERE session_id = ?`, compare with new team's `agent_key`s, emit `console.warn`. | Implementation note; no spec change. |
| M8 | Synthetic user message `content` shape. v1 is text-only per `06-agent-model.md`; the body never sends image content. `UserMessage.content` is always a `string`. | Implementation note; no spec change. |
| M9 | Graceful shutdown implementation. `09-deployment.md` 4 steps. `JieHandle.stop(timeoutMs)`: call `agent.abort()` on each body; `Promise.race([allBodiesWaitForIdle, sleep(timeoutMs)])`; force-exit via `process.exit(0)` on race-loss. | Implementation note; no spec change. |
| M10 | CLI `-p` mode filter. `ui/cli.md`: subscribe to `agent.stream.chunk` filtered by `agent_role === leader`. CLI publishes to `leader.prompt` and waits for `agent.idle`. | Implementation note; no spec change. |

## Resume Plan (tmr)

1. Write spec corrections for M1, M2, M3 in `06-agent-model.md` and `03-event-system.md`.
2. Begin writing `packages/jie-platform/` source files for the v1 MVP, in this order:
   1. `monorepo` skeleton (root `package.json` with workspaces, root `tsconfig.json`, `.gitignore`).
   2. `packages/jie-platform/storage/{storage,sqlite-storage,init-db,artifact-store,memory-store,index}.ts` (ADR 14).
   3. `packages/jie-platform/core/{event-bus,agent-body,agent-soul,tool,event-payload}.ts` + `tool-error.ts`.
   4. `packages/jie-platform/tools/{notify,bash,read_file,write_file,web_search,web_fetch,write_artifact,read_artifact,index}.ts`.
   5. `packages/jie-platform/team/loader.ts` + `team/minimal/{TEAM,general}.md` (ADR 16).
   6. `packages/jie-platform/config/{settings,auth,resolve-team,resolve-model}.ts` (hand-rolled per ADR 19).
   7. `packages/jie-platform/start.ts` (ADR 15).
   8. `packages/jie-platform/index.ts` (barrel).
3. `packages/jie-cli/index.ts` (the harness): `-p`, `login`, `logout`, `model`, `team`, `--resume`/`--continue`, `--api-key`, `--version`, `--help`. Stub `jie` (no flag) to print "TUI not implemented" and exit 1.
4. `packages/jie-tui/index.ts` (stub throws).
5. `packages/jie-team/package.json` (placeholder).
6. `bun test` setup with co-located `*.test.ts` files.
7. Run user scenarios (1, 4, 5, 6, 7) against the platform; deferred TUI scenarios (2, 3, 9) stay in test plan for post-MVP.
