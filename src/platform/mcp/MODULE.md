---
no-new-exports:
  - json.ts
  - load-config.test.ts
  - load-config.ts
  - manager.test.ts
  - manager.ts
  - module.ts
  - schema.test.ts
  - schema.ts
  - stdio-connection.test.ts
  - stdio-connection.ts
  - subprocess.ts
  - tool-adapter.test.ts
  - tool-adapter.ts
---

## mcp
- Minimal MCP client per ADR 4 and spec 10: read `mcp.json` (global `~/.jie/` + project `.jie/`, project overrides per server name), connect every configured server at startup, and register each advertised tool into the `ToolRegistry` as `mcp:<server>:<tool>`.
- `load-config.ts` parses and normalizes at load time: `args` defaults to `[]`, `auth` to `null`, server names are restricted to `[A-Za-z0-9._-]{1,64}` so registry keys and `mcp:<server>:<glob>` specs stay unambiguous. Downstream consumers use the ready types in `types.ts` and never re-parse.
- Malformed `mcp.json` is a hard `INVALID_CONFIG` failure (like `settings.json`); connection and tool-listing failures are WARN+skip so one broken server never blocks platform boot.
- `stdio-connection.ts` owns the client side of the wire protocol, hand-rolled JSON-RPC over stdio (no MCP SDK): initialize handshake, `notifications/initialized`, `tools/list`, `tools/call`, request timeouts, line re-assembly, graceful close (stdin end, then kill after a grace period). Wire DTOs stay private to the file; the module-facing contract is `McpConnection` (`listTools`/`callTool`/`close`).
- `subprocess.ts` is the injectable process seam (`SubprocessFactory`); the Bun implementation inherits the platform environment, so `auth.tokenEnv` values reach stdio servers through env inheritance (bearer-token semantics matter for the future http transport, which connectAll WARN+skips in v1).
- `tool-adapter.ts` turns a server tool into a platform `Tool`: registry key keeps colons (`mcp:<server>:<tool>`), but `Tool.name` is sanitized to `[a-zA-Z0-9_-]{1,64}` because LLM provider APIs reject other characters; the server's JSON schema becomes typebox via the subset mapper in `schema.ts` (unrecognized shapes fall back to `Type.Any()`). A tool-level `isError` result is thrown so the agent loop surfaces it like any failed tool.
- `manager.ts` orchestrates startup (`connectAll`) and teardown (`dispose`); the connector is injected (`McpConnector`) so unit tests never spawn processes. Implementation types stay inside the module: only `module.ts` registration and unit tests see them.
- `json.ts` is the module-local raw-JSON vocabulary (`JsonValue`/`JsonObject`); code-lens's protocol types are off-limits (the platform is agnostic of code-lens).
