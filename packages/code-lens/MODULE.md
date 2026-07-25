---
no-new-exports:
  - index.ts
  - model.ts
  - symbol.ts
  - symbol.test.ts
  - ingest.ts
  - ingest.test.ts
---

## code-lens
- A standalone MCP server providing code-architecture facts (structure, type graph, coupling references) without implementation detail. Read-only consumer of SCIP indexes; it never runs an indexer.
- Facts, not verdicts: it exposes queryable structure and references; the consuming agent judges what counts as bad coupling.
- `scip/` holds generated protobuf bindings (`scip.js`, `scip.d.ts`) vendored from `scip.proto`; regenerate with `protobufjs-cli` (`pbjs`/`pbts`), never hand-edit.
- `fixtures/` holds a committed TS project plus its `index.scip`, so unit tests run without an indexer.
