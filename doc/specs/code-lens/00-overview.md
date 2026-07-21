# Code-Lens — Overview

**Status: aspirational — no code yet.**

## Purpose

Code-Lens is a standalone MCP server in `packages/code-lens/` that provides AST-only code-structure queries to any MCP client: exported symbols with canonical signatures, and the file-level import graph. It is deliberately not coupled to jie's team layer — within jie an agent consumes it like any other MCP server, and outside jie it serves IDE plugins, CI tooling, or other agent frameworks equally. Why standalone rather than in-process:

- Reuse: one MCP server serves any MCP client, not just jie.
- Tool visibility: a soul declares `mcp:code-lens:*` in `tools:` and the body registers the tools with full schemas; the LLM sees them as first-class tools, no indirection.
- Memory isolation: a large project's AST is hundreds of MB; it stays out of every team process.
- Lifecycle: the server can outlive a team session, hold warm AST state across runs, and restart independently (warm state is lost on crash; re-index on next startup).

## Language adapters

Language-pluggable via a `LanguageAdapter` interface:

```typescript
interface LanguageAdapter {
  language: string;    // e.g. 'typescript'
  extensions: string[]; // e.g. ['.ts', '.tsx']
  extract_exports(file: string): Promise<{ name: string; signature: string }[]>;
  signature_equal(a: string, b: string): boolean;
  import_graph(root: string): Promise<{ from: string; to: string }[]>;
}
```

Signatures are opaque canonical text owned by the adapter; function bodies are stripped, so callers receive only names, signatures, and graph edges. v1 ships a single TypeScript adapter backed by `ts-morph` (the TypeScript compiler API): top-level exported declarations (unnamed defaults get the synthetic name `default`; re-exports excluded), structural signature canonicalization with exact-string equality after re-parse, and a static import graph resolved via the nearest `tsconfig.json` (path aliases included; `node_modules` edges and dynamic imports excluded).

## MCP surface and deployment

Two tools, dispatched to the adapter by file extension: `get_module_exports(path)` → per-file `{ name, signature }` entries, and `get_import_graph(root)` → workspace-relative `{ from, to }` edges. Both are read-only; unparseable files yield empty results rather than errors. Adapters cache parsed ASTs keyed by `(file_path, source_mtime)`, so repeated queries are cheap and output is deterministic for a given input.

Code-Lens runs as a stdio MCP server configured in the client's MCP config — in jie it is an ordinary entry in the platform's MCP server configuration (see `jie-platform/10-configuration.md`), one instance per workspace, with no special-casing in the runtime.
