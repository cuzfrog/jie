# ADR 32: Code-Lens — SCIP Substrate, Read-Only Consumer, Facts Not Verdicts

## Status

Accepted and implemented. `packages/code-lens/` ships the SCIP-based server; see `doc/specs/code-lens/00-overview.md`.

## Context

Code-lens must give agents code structure and dependency data for TypeScript, Python, Java, Rust, and Go, stripped of implementation bodies. Per-language adapters were rejected; SCIP unifies.

## Decision

Three coupled decisions:

**SCIP as the unified language-agnostic substrate.** Code-lens ingests one format — the SCIP protobuf index — and every language-specific concern is delegated to the existing SCIP indexers (scip-typescript, scip-python, scip-java, scip for Rust, scip-go). One ingestion path, one `CodeIndex` model, one query layer for all languages; adding a language means an indexer on the user's side, zero code here.

**Read-only consumer; the user activates the provider.** Code-lens never ships, runs, or drives an indexer. Generating `index.scip` is the user's integration act. When no index exists the server still handshakes and lists its tools, but every tool call returns an `isError` result naming the missing index and listing per-language indexer setup steps.

**Facts, not verdicts.** Coupling analysis emits queryable data — cycles in the file and type graphs, and cross-file references annotated with visibility facts (target kind, defining file, locality, whether it is an import). The consuming agent, which has the architectural context code-lens lacks, renders the judgment. Code-lens contains no deterministic coupling heuristic, and the enforcement concern (no-new-exports gating) is excluded entirely.

## Consequences

- One dependency (`protobufjs`). Index freshness user responsibility. Unavailability is tool-level error, not connection failure.
