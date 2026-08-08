# Code-Lens — Overview

## Purpose

Code-Lens is a standalone MCP server in `src/code-lens/` that gives agents code-architecture facts — layered structure with implementation bodies stripped, plus dependency and coupling data — without implementation detail. It covers TypeScript, Python, Java, Rust, and Go on one shared pipeline (ADR 32): it is a read-only consumer of SCIP indexes, never an indexer. Two concerns are deliberately kept out: coupling *verdicts* (it emits facts — cycles, visibility-annotated cross-file references — and the consuming agent judges what counts as bad coupling) and enforcement (no-new-exports gating belongs elsewhere, not here). Why standalone rather than in-process:

- Reuse: one MCP server serves any MCP client, not just jie.
- Tool visibility: a soul declares `mcp:code-lens:*` in `tools:` and the body registers the tools with full schemas; the LLM sees them as first-class tools, no indirection.
- Memory isolation: a large project's index stays in the server process, out of every team process.
- Lifecycle: the server restarts independently of team sessions.

## Ingestion

One SCIP protobuf index per workspace, read lazily on first tool call and cached for the process. The SCIP schema is the language-agnostic substrate: every language-specific concern is delegated to the existing SCIP indexers (scip-typescript, scip-python, scip-java, scip for Rust, scip-go), so code-lens has a single ingestion path, one model (`CodeIndex`: files with symbols and references, a symbol table keyed by SCIP symbol id), and one query layer for all languages. The protobuf bindings in `scip/` are generated from `scip.proto` and vendored — regenerated with `protobufjs-cli`, never hand-edited.

Provider activation is the user's act: code-lens never runs an indexer. When no index is found, the server still handshakes and registers its tools, but every tool call returns an `isError` result explaining that code-lens is unavailable and listing the per-language indexer setup steps. This keeps unavailability a tool-level fact rather than a failed MCP connection, so agents can surface "not available" and the platform's tool-resolution startup checks still pass.

## Query surface

Six read-only tools, all deterministic (sorted output, no wall-clock or randomness):

| Tool | Returns |
|---|---|
| `index_status` | Indexer tool and version, project root, per-file symbol and reference counts. |
| `code_structure` | Layered structure — files, top-level declarations, type members — with signatures and no bodies; optional `pathPrefix` filter. |
| `import_graph` | File-level edges: A -> B means file A references symbols defined in file B. |
| `type_graph` | Type-level edges: implements and type-definition relationships between types. |
| `cycles` | Cyclic dependencies in the file import graph (`scope: files`, default) or the type graph (`scope: types`). |
| `boundary_references` | Cross-file references annotated with facts: target kind, where the target is defined, whether it is local to its file, whether the reference is an import. |

The query layer is internal to the package; the library surface (`index.ts`) is ingestion and model only.

## MCP surface and deployment

A hand-rolled newline-delimited JSON-RPC stdio server (`protocol.ts`/`server.ts`, `main.ts` as bin `code-lens`) — no MCP SDK, on either side of the wire. The index path defaults to `./index.scip`, overridable with `--index <path>`. Stdin end or stdout EPIPE exits 0, so platform-driven shutdown is clean.

Within jie it is shipped as a built-in but configured like any other server in `.jie/mcp.json` (ADR 4), with no special-casing in the runtime:

```json
{ "servers": { "code-lens": { "transport": "stdio", "command": "bun", "args": ["src/code-lens/main.ts"] } } }
```

Index freshness is the user's responsibility: re-run the indexer to refresh, and `index_status` reports what is loaded so staleness is self-evident.
