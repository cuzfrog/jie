# Code-Lens Service

A standalone process in `packages/code-lens/`. **Exposes an MCP server.** Provides AST-only views of a codebase to any MCP client — IDE plugins, CI tooling, agent frameworks.

> Code-Lens is reusable. It is not coupled to Jie's team layer. Within Jie, an agent connects to it like any other MCP server, and its tools are auto-promoted to first-class entries in the agent's tool list (see `06-agent-model.md`).

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

Both tools dispatch to the appropriate language adapter based on file extension. Function and method bodies are stripped before returning. Callers receive only names, signatures, and graph edges — no implementation detail.

## Why MCP (and Why Standalone)

- **Reuse.** MCP is the standard agent-tooling protocol. A standalone Code-Lens MCP server can serve any MCP client — IDE plugins, CI scripts, other agent frameworks — not just Jie. In-process coupling would prevent that.
- **Tool visibility for the agent.** Although Code-Lens speaks MCP, the agent's soul declares `mcp:code-lens:get_module_exports` and `mcp:code-lens:get_import_graph` explicitly. At soul-load time the body fetches their schemas and registers them as first-class `Tool` instances. The LLM sees them with full schemas. There is no `use_mcp` indirection.
- **Memory isolation.** A TypeScript AST for a large project is hundreds of MB. Keeping that out of every team process is a feature.
- **Lifecycle independence.** Code-Lens can outlive a team session, hold warm AST state across runs, and be restarted without restarting the team.

## Deployment and Lifecycle

Code-Lens is deployed **per team**: one instance per workspace codebase, started by the supervisor alongside the team processes. It is not a global singleton.

- **Discovery.** Code-Lens is configured like any other MCP server in `.jie/mcp.yaml` (or `~/.jie/mcp.yaml`). The platform treats it uniformly — no special-casing in the runtime. The dev team (`jie-team`) declares its code-lens dependency in its manifest (`mcp:code-lens:get_module_exports`, `mcp:code-lens:get_import_graph` in the Architect role's `tools:`).
- **Startup.** The platform connects to code-lens like any other MCP server: per-server connect failures log a `WARN` and skip that server. If a team's blueprint references tools from a failed server, the team fails at startup with a precise error citing the missing tool — see `jie-platform/10-configuration.md` "MCP Server Configuration" and the cascade policy in `jie-platform/06-agent-model.md` "MCP Server Management". This is the standard MCP cascade, not a code-lens-specific rule. In practice, the dev team fails to start when code-lens is unreachable; the minimal team (which has no code-lens dependency) is unaffected.
- **Crash recovery.** Code-Lens follows the standard MCP crash policy (see `06-agent-model.md` "Failure Handling"): mid-session disconnect → the next Code-Lens MCP call returns `mcp_server_unreachable` → body force-publishes a terminal event and exits. The supervisor restarts the full team. Warm AST state is lost on crash; the next startup re-indexes from scratch.
- **Per-team rationale.** v1 assumes one team = one workspace. A per-team Code-Lens avoids multi-tenant root disambiguation and isolates failure to one team. Cross-team AST sharing adds complexity with no v1 payoff.

## Why Not Run LSP Inline

LSP is heavyweight (long startup, high memory) and its hover/signature output format is server-defined per language. Code-Lens hides that behind a uniform adapter interface and keeps any LSP processes (when used) long-lived inside the service, so callers get fast queries.
