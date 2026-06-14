# jie-platform MVP — Implementation Plan

## Scope

MVP of `packages/jie-platform`, `packages/jie-cli`, and `packages/jie-tui` (stub only). Implements the v1 acceptance surface from `specs/jie-platform/00-user-scenarios.md`:

1. `jie -p "<instruction>"` — one-shot print mode with the built-in minimal team.
2. `jie --team <id> -p "<instruction>"` — same with a user-installed team.
3. First-time setup: `jie login` + `jie model` + `jie -p`.

**Out of v1 scope:** TUI (stub, throws), MCP client, jie-team manifests, code-lens.

## Issues

| # | GitHub | Title | Phase |
|---|--------|-------|-------|
| 1 | [#2](https://github.com/cuzfrog/jie/issues/2) | Storage Layer + Schema Bootstrap | 1 |
| 2 | [#3](https://github.com/cuzfrog/jie/issues/3) | EventBus | 1 |
| 3 | [#4](https://github.com/cuzfrog/jie/issues/4) | Configuration Discovery | 1 |
| 4 | [#5](https://github.com/cuzfrog/jie/issues/5) | Domain Stores (ArtifactStore + MemoryManager) | 2 |
| 5 | [#6](https://github.com/cuzfrog/jie/issues/6) | Tool System Core (Tool interface + ToolRegistry) | 2 |
| 6 | [#7](https://github.com/cuzfrog/jie/issues/7) | Team-Blueprint Loader + Built-in Minimal Team Manifest Files | 2 |
| 7 | [#8](https://github.com/cuzfrog/jie/issues/8) | Built-in Tool: notify | 3 |
| 8 | [#9](https://github.com/cuzfrog/jie/issues/9) | Built-in Tools: bash + read_file + write_file | 3 |
| 9 | [#10](https://github.com/cuzfrog/jie/issues/10) | Built-in Tools: web_search + web_fetch + write_artifact + read_artifact | 3 |
| 10 | [#11](https://github.com/cuzfrog/jie/issues/11) | AgentBody Core | 4 |
| 11 | [#12](https://github.com/cuzfrog/jie/issues/12) | AgentBody Event Bridging + Streaming + Memory Writes | 4 |
| 12 | [#13](https://github.com/cuzfrog/jie/issues/13) | startJie Entry Function | 5 |
| 13 | [#14](https://github.com/cuzfrog/jie/issues/14) | CLI: jie -p one-shot print mode | 6 |
| 14 | [#15](https://github.com/cuzfrog/jie/issues/15) | CLI: all other commands | 6 |
| 15 | [#16](https://github.com/cuzfrog/jie/issues/16) | End-to-End Tests + Event-Order Contract Validation | 7 |

## Dependency Graph

```
Phase 1 (parallel)
  [#2 Storage+Schema]   [#3 EventBus]   [#4 Config Discovery]
        |                                       |
Phase 2 (parallel after Phase 1)
  [#5 Domain Stores]  [#6 Tool Core]  [#7 Team Loader]
  (needs #2)          (independent)   (needs #6)
        |                   |
Phase 3 (parallel after Phase 2)
  [#8 notify]  [#9 bash/read/write]  [#10 web+artifact tools]
  (needs #3,6) (needs #6)            (needs #5,6)
        |           |           |
Phase 4 (sequential after Phase 3)
              [#11 AgentBody Core]
              (needs all of Phase 1-3)
                      |
              [#12 AgentBody Event Bridging]
              (needs #11)
                      |
Phase 5
              [#13 startJie Entry Function]
              (needs #12)
                      |
Phase 6 (parallel after Phase 5)
   [#14 CLI: jie -p]   [#15 CLI: all other commands]
   (needs #13)         (needs #13, #14 for --api-key + -p)
              |
Phase 7
   [#16 E2E + Event-Order Contract]
   (needs #14, #15)
```

Phases 1–3 have parallel tracks; Phases 4–7 are sequential.

## Functional AC
`specs/jie-platform/00-user-scenarios.md`