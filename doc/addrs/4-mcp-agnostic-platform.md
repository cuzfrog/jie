# ADR 4: MCP-Agnostic Platform

## Status

Accepted and implemented. The minimal MCP client.; see `10-configuration.md` "MCP Server Configuration". The `http` transport is WARN+skipped in v1.

## Context

Previously Code-Lens was treated specially; other servers had no connection config.

## Decision

The platform has zero knowledge of specific MCP servers. All servers are configured uniformly in `mcp.json` (project `.jie/mcp.json` overrides global `~/.jie/mcp.json`):

```json
{ "servers": { "<name>": { "transport": "stdio | http" } } }
```

The platform connects to every listed server at startup, fetches tool catalogs, and registers all tools into `ToolRegistry` as `mcp:<name>:<tool>`. Stdio subprocesses are managed by the platform; HTTP servers are external.

Code-Lens is just another server.

## Consequences

- `code_lens_url` stays out of platform config and process topology. No port probing.
- Any MCP server (GitHub, JIRA, custom) is a config entry away — no platform code change.
- The `ToolSpec` syntax `mcp:<server>:<glob>` resolves against pre-registered tools; an agent `.md` listing an MCP tool whose server failed to connect fails the cascade-policy startup check.
- The `Tool.name` registered with LLMs is sanitized to `[a-zA-Z0-9_-]{1,64}` because provider tool-name APIs reject colons; the registry key and `label` keep the colon form `mcp:<server>:<tool>`.
