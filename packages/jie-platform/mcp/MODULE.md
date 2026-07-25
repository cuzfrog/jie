---
no-new-exports:
  - json.ts
  - load-config.test.ts
  - load-config.ts
  - stdio-connection.test.ts
  - stdio-connection.ts
  - subprocess.ts
  - types.ts
---

## mcp
- Minimal MCP client per ADR 4 and spec 10: read `mcp.json` (global `~/.jie/` + project `.jie/`, project overrides per server name), connect every configured server at startup, and register each advertised tool into the `ToolRegistry` as `mcp:<server>:<tool>`.
- `load-config.ts` parses and normalizes at load time: `args` defaults to `[]`, `auth` to `null`, server names are restricted to `[A-Za-z0-9._-]{1,64}` so registry keys and `mcp:<server>:<glob>` specs stay unambiguous. Downstream consumers use the ready types in `types.ts` and never re-parse.
- Config validation failures are hard (`INVALID_CONFIG`); connection and tool-listing failures are WARN+skip so one broken server never blocks platform boot.
- `stdio-connection.ts` owns the client side of the wire protocol, hand-rolled JSON-RPC over stdio (no MCP SDK): initialize handshake, `notifications/initialized`, `tools/list`, `tools/call`, request timeouts, line re-assembly, graceful close (stdin end, then kill after a grace period). Wire DTOs stay private to the file; the module-facing contract is `McpConnection` (`listTools`/`callTool`/`close`).
- `subprocess.ts` is the injectable process seam (`SubprocessFactory`); the Bun implementation inherits the platform environment, so `auth.tokenEnv` values reach stdio servers through env inheritance (bearer-token semantics matter for the future http transport).
- `json.ts` is the module-local raw-JSON vocabulary (`JsonValue`/`JsonObject`/`isJsonObject`); code-lens's protocol types are off-limits (the platform is agnostic of code-lens).
