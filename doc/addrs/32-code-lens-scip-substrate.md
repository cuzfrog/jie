# ADR 32: Code-Lens — SCIP Substrate, Read-Only Consumer, Facts Not Verdicts

## Status

Accepted and implemented. `packages/code-lens/` ships the SCIP-based server; see `doc/specs/code-lens/00-overview.md`.

## Context

Code-lens must give agents code structure and dependency data for TypeScript, Python, Java, Rust, and Go, stripped of implementation bodies. The naive design is a per-language adapter (ts-morph for TypeScript, an LSP client or tree-sitter grammar per other language), each producing its own notion of symbol, signature, and reference. That multiplies the extraction code by five and makes the query layer's output language-dependent. Separately, the design discussion raised two questions: whether code-lens should ship or drive the indexers that produce its input, and whether it should itself decide what counts as bad coupling (a deterministic step up from the no-new-exports gate).

## Decision

Three coupled decisions:

**SCIP as the unified language-agnostic substrate.** Code-lens ingests one format — the SCIP protobuf index — and every language-specific concern is delegated to the existing SCIP indexers (scip-typescript, scip-python, scip-java, scip for Rust, scip-go). One ingestion path, one `CodeIndex` model, one query layer for all languages; adding a language means an indexer on the user's side, zero code here.

**Read-only consumer; the user activates the provider.** Code-lens never ships, runs, or drives an indexer. Generating `index.scip` is the user's integration act. When no index exists the server still handshakes and lists its tools, but every tool call returns an `isError` result naming the missing index and listing per-language indexer setup steps.

**Facts, not verdicts.** Coupling analysis emits queryable data — cycles in the file and type graphs, and cross-file references annotated with visibility facts (target kind, defining file, locality, whether it is an import). The consuming agent, which has the architectural context code-lens lacks, renders the judgment. Code-lens contains no deterministic coupling heuristic, and the enforcement concern (no-new-exports gating) is excluded entirely.

## Consequences

- One dependency (`protobufjs`) and one vendored generated artifact (`scip/` bindings) instead of five language toolchains; the SCIP schema version is the upgrade surface.
- Index freshness is the user's responsibility; `index_status` reports the loaded indexer and counts so staleness is visible, but code-lens cannot detect a drifted index on its own.
- The unavailability path is a tool-level error, not a connection failure: the MCP handshake and the platform's `ToolSpec` cascade checks (ADR 4) always pass, and an agent can report "code-lens not available" and continue.
- Language coverage is bounded by the SCIP indexer ecosystem; C/C++ is out of scope because it has no mature SCIP indexer.
- Quality of coupling review depends on the consuming model's judgment; the payoff is that the same facts serve any client and any review policy without code-lens encoding one.
