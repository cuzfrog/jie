# Code-Lens Service

A standalone process in `packages/code-lens/`. **Exposes an MCP server.** Provides AST-only views of a codebase to the team's Architect (and to any other MCP client — IDE plugins, CI tooling, future agent frameworks).

> Code-Lens is reusable. It is not coupled to Jie. Within Jie, the Architect connects to it like any other MCP server, and its tools are auto-promoted to first-class entries in the Architect's tool list (see `07-agent-model.md`).

## Architecture

Code-Lens is **language-pluggable** via a `LanguageAdapter` interface. The service routes a file to the adapter registered for its language (by file extension or project config) and returns the adapter's normalized output.

```typescript
interface LanguageAdapter {
  language:   string;          // 'typescript', 'python', 'rust', ...
  extensions: string[];        // ['.ts', '.tsx']

  // Extract public/exported symbols from a single file.
  extract_exports(file_path: string): Promise<{
    name: string;              // synthetic for unnamed exports (e.g. 'default')
    signature: string;         // canonical text, opaque to callers
  }[]>;

  // Compare two canonical signatures for semantic equality.
  signature_equal(a: string, b: string): boolean;

  // Build the file-level import graph for a directory tree.
  import_graph(root: string): Promise<{ from: string; to: string }[]>;
}
```

Adapter implementations may be backed by AST libraries (e.g. `ts-morph` for TypeScript), language servers over LSP (e.g. `pyright`, `rust-analyzer`), or a hybrid. The choice is the adapter's concern.

v1 ships with a **TypeScript adapter** only; other languages are out of scope until the language-adapter ecosystem is established.

## MCP Tools

```
get_module_exports(path: string)
  → { file: string, entries: { name: string, signature: string }[] }[]

get_import_graph(root: string)
  → { from: string, to: string }[]
```

Both tools dispatch to the appropriate language adapter based on file extension. Function and method bodies are stripped before returning. The Architect receives only names, signatures, and graph edges — no implementation detail.

This is the concrete enforcement mechanism for the Architect knowing the codebase only down to function-signature level.

## Why MCP (and Why Standalone)

- **Reuse.** MCP is the standard agent-tooling protocol. A standalone Code-Lens MCP server can serve any MCP client — IDE plugins, CI scripts, other agent frameworks — not just Jie. In-process coupling would prevent that.
- **Tool visibility for the Architect.** Although Code-Lens speaks MCP, the Architect's soul declares `mcp:code-lens:get_module_exports` and `mcp:code-lens:get_import_graph` explicitly. At soul-load time the body fetches their schemas and registers them as first-class `Tool` instances. The LLM sees them with full schemas. There is no `use_mcp` indirection.
- **Memory isolation.** A TypeScript AST for a large project is hundreds of MB. Keeping that out of every team process is a feature.
- **Lifecycle independence.** Code-Lens can outlive a team session, hold warm AST state across runs, and be restarted without restarting the team.

## Why Not Run LSP Inline

LSP is heavyweight (long startup, high memory) and its hover/signature output format is server-defined per language. Code-Lens hides that behind a uniform adapter interface and keeps any LSP processes (when used) long-lived inside the service, so callers get fast queries.
