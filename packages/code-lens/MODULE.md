---
no-new-exports:
  - index.ts
  - model.ts
  - symbol.ts
  - symbol.test.ts
  - ingest.ts
  - ingest.test.ts
  - graph.ts
  - graph.test.ts
  - structure.ts
  - structure.test.ts
  - import-graph.ts
  - import-graph.test.ts
  - type-graph.ts
  - type-graph.test.ts
  - boundary.ts
  - boundary.test.ts
  - status.ts
  - status.test.ts
---

## code-lens
- A standalone MCP server providing code-architecture facts (structure, type graph, coupling references) without implementation detail. Read-only consumer of SCIP indexes; it never runs an indexer.
- Facts, not verdicts: it exposes queryable structure and references; the consuming agent judges what counts as bad coupling.
- `index.ts` is the minimal library surface (ingestion + model). The query layer (`structure`, `import-graph`, `type-graph`, `graph`, `boundary`, `status`) is internal: consumed by the MCP server and unit tests via direct sibling imports, never re-exported.
- `scip/` holds generated protobuf bindings (`scip.js`, `scip.d.ts`) vendored from `scip.proto`; regenerate with `protobufjs-cli` (`pbjs`/`pbts`), never hand-edit.
- `fixtures/` holds a committed TS project plus its `index.scip`, so unit tests run without an indexer.
