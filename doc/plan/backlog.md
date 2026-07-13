# jie-platform Backlog (Day 2+)

Items deferred from v0.2 and v1 milestones. Each entry references its origin spec/plan and the v0.2 milestone it would unblock.

## Items deferred from v0.2 TUI

| Item | Origin | v0.2 reference |
|---|---|---|
| TUI a11y / theme customization | v0.2 plan "Out of scope" | `doc/plan/jie-platform/v0.2-mvp-tui.md` |
| vim-style keybindings (Day 2+ add-on) | v0.2 plan "Out of scope" | `doc/plan/jie-platform/v0.2-mvp-tui.md` |
| TUI snapshot corpus expansion (recorded from live e2e runs) | v0.2 plan "Out of scope" | `doc/plan/jie-platform/v0.2-mvp-tui.md` |
| Multi-process team visibility (NATS) | v0.2 plan "Out of scope" | `doc/plan/jie-platform/v0.2-mvp-tui.md`, ADR 19 |

## Items deferred from earlier milestones

| Item | Origin |
|---|---|
| MCP client integration | `doc/specs/jie-platform/10-configuration.md` "MCP Server Configuration"; ADR 15 |
| jie-team dev team (`specs/jie-team/`) | `00-user-scenarios-archive.md` Scenario 2 |
| jie npm publish / install script / `jie upgrade` | v0.2 plan "Out of scope" (backlog #20) |
| Cross-process team visibility (NATS) | ADR 19 (Day 2+) |
| LLM-driven recording of event traces (vs hand-recorded fixtures) | v0.2 plan "Snapshot / replay tests" |
| Hand-rolled raw-mode renderer / Ink / blessed | v0.2 plan "Library" decision; pi-tui is locked in |



| # | Item | Priority |
|---|---|---|
| 2 | NATS JetStream configuration details: stream limits, retention, replication. Exact policy (TTL, size cap). | Day 2 |
| 7 | **Storage Maintenance chapter**: artifact retention, GC, archival, backup. Status chain compaction, JetStream pruning. v1 keeps everything indefinitely. | Day 2 |
| 9 | **Custom Agents chapter**: schema and loading for user-defined agents vs built-in team blueprints. | Day 2 |
| 16 | **Security chapter**: multi-tenant NATS isolation, auth, access control. Bash tool OS-level sandboxing (chroot, container, seccomp). v1: path-based enforcement only; soft isolation deferred. | Day 3 |
| 17 | **Reliability chapter**: agent crash recovery, supervisor force-publishing on behalf of crashed agents, status consistency after crashes, prompt queue persistence across leader restarts. v1: assumes agents don't crash mid-task. | Day 2 |
| 18 | **Memory chapter review**: leader prompt queue durability, compaction policy tuning, token budget defaults, snapshot frequency, restart recovery edge cases. | Day 2 |
| 19 | **Prompt queue cap policy**: v1's `AgentBody` in-memory prompt queue is unbounded (matches pi-agent's `followUpQueue` / `steeringQueue`). Decide: cap value, drop policy (oldest vs reject-newest), observability (log only vs event). Spec: `06-agent-model.md` "Prompt Ingress & Queuing". | Day 2 |
| 20 | **Install / Publish infrastructure**: (a) publish `@cuzfrog/jie` to npm with `bun publish`, (b) host the install script at `https://install.jie.dev` (OS check, bun check, pinned version, idempotent re-run), (c) `jie upgrade` subcommand. v1: `git clone` + `bun link --global` is the only install path. | Day 2 |
| 21 | **TUI implementation**: build the working TUI in `packages/jie-tui/`. v1 ships a stub (`packages/jie-tui/index.ts` throws "TUI not implemented"). When the TUI lands, the deferred scenarios in `00-user-scenarios-archive.md` re-enter the test plan. The TUI subscribes to platform events and renders agents / streams / tool calls. Spec: `ui/tui-overview.md`. | Day 2 |
| 22 | **Artifact store BLOB + compression**: switch the `artifacts.content` column from `TEXT` to `BLOB` and add transparent gzip compression on write / decompression on read (via Bun's `CompressionStream`). v1 is text-only and the compression overhead is not worth the modest space savings; revisit when binary artifacts (PDFs, images) land. The validation rules (key charset `[A-Za-z0-9_./-]{1,256}`, content cap 5 MiB) stay the same. Spec: `05-artifact-store.md`, `06-agent-model.md` "Built-in Tools: `write_artifact` and `read_artifact`". | Day 2+ |
| 23 | **Event-Order Contract: per-body `seq` for NATS cross-subject reorder protection.** The v1 `InProcessEventBus` preserves per-body event order via synchronous dispatch (see `03-event-system.md` "Event-Order Contract"). NATS preserves order per subject but not across subjects; `agent.turn.start` and `agent.idle` are different subjects, so the body-side alternation could be observed out of order by a subscriber once we move to NATS. The Day-2 fix: a per-body monotonic `seq` stamped on every event the body publishes; observers discard updates whose `seq` ≤ last-seen for that body. Spec: `03-event-system.md` "Event-Order Contract" and ADR 22. | Day 2 |
| 24 | **jie-team package**: ship the dev team (DM, Researcher, Architect, Planner, Implementer, Reviewer) as `.md` manifest files. v1 ships only the built-in minimal team. When jie-team ships, the dev team becomes installable at `~/.jie/teams/dev/`. Spec: `specs/jie-team/`. | Day 2 |
| 25 | **code-lens package**: ship the standalone MCP server. v1 has no `packages/code-lens/`. | Day 2 |
| 26 | **MCP client integration**: connect to MCP servers listed in `.jie/mcp.json`. v1 does not load `mcp.json`; the `ToolRegistry`'s `mcp:<server>:<tool>` and `mcp:<server>:*` spec syntax returns zero matches. Spec: `10-configuration.md` "MCP Server Configuration". | Day 2 |

## Deferred user scenarios

The Day 2+ user scenarios from the original `00-user-scenarios.md` are preserved in `00-user-scenarios-archive.md` as a reference for the test plan when the corresponding features land.

| Scenario | Requires | Spec |
|---|---|---|
| 1: simple agent (TUI) | TUI | `ui/tui-user-scenarios.md` T1 |
| 2: pass work in a team (TUI) | TUI + dev team | `ui/tui-user-scenarios.md` T2 |
| 3: switch teams (TUI flow) | TUI | `ui/tui-user-scenarios.md` T3 |
| 6: first-time setup (TUI flow) | TUI | `ui/tui-user-scenarios.md` T4 |
| 7: MCP-backed tools | MCP client + a mock MCP server | `10-configuration.md` "MCP Server Configuration" |
| 9: queued prompts while leader is busy | TUI + prompt queue observability | `ui/tui-user-scenarios.md` T5 |
