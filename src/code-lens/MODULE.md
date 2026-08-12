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
  - protocol.ts
  - protocol.test.ts
  - tools.ts
  - tools.test.ts
  - server.ts
  - server.test.ts
  - index-source.ts
  - index-source.test.ts
  - setup.ts
  - setup.test.ts
  - main.ts
---

## code-lens
Standalone MCP server: read-only SCIP consumer providing architecture facts (structure, graphs, boundaries). No indexer runs here; fixtures supply `index.scip` for tests.
- `scip/` holds vendored protobuf bindings (regenerate with `pbjs`/`pbts`).
- Lazy index loading; failures return `isError` with setup guidance.
