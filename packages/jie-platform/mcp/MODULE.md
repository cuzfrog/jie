---
no-new-exports:
  - load-config.test.ts
  - load-config.ts
  - types.ts
---

## mcp
- Minimal MCP client per ADR 4 and spec 10: read `mcp.json` (global `~/.jie/` + project `.jie/`, project overrides per server name), connect every configured server at startup, and register each advertised tool into the `ToolRegistry` as `mcp:<server>:<tool>`.
- `load-config.ts` parses and normalizes at load time: `args` defaults to `[]`, `auth` to `null`, server names are restricted to `[A-Za-z0-9._-]{1,64}` so registry keys and `mcp:<server>:<glob>` specs stay unambiguous. Downstream consumers use the ready types in `types.ts` and never re-parse.
- Config validation failures are hard (`INVALID_CONFIG`); connection and tool-listing failures are WARN+skip so one broken server never blocks platform boot.
- The wire protocol is hand-rolled JSON-RPC over stdio (no MCP SDK); wire DTOs stay local to this module.
