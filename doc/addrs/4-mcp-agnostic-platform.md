# ADR 4: MCP-Agnostic Platform

## Status

Accepted. Design decision for when the MCP client lands — no MCP code is implemented today; `mcp.json` is not loaded yet (`10-configuration.md` "MCP Server Configuration").

## Context

Previous design treated Code-Lens as a special MCP server: the platform probed ports for it, `code_lens_url` was a first-class config field, and `09-deployment.md` dedicated a column in the process table to it. Other MCP servers (GitHub, JIRA) were referenced in role definitions but had no connection config.

## Decision

The platform has zero knowledge of specific MCP servers. All servers are configured uniformly in `mcp.json` (project `.jie/mcp.json` overrides global `~/.jie/mcp.json`):

```json
{ "servers": { "<name>": { "transport": "stdio | http" } } }
```

The platform connects to every listed server at startup, fetches tool catalogs, and registers all tools into `ToolRegistry` as `mcp:<name>:<tool>`. Stdio subprocesses are managed by the platform; HTTP servers are external.

Code-Lens is just an MCP server we happen to ship in this monorepo. The CLI init flow may auto-generate its `mcp.json` entry for convenience, but the platform treats it identically to any other server.

## Consequences

- `code_lens_url` stays out of platform config and process topology. No port probing.
- Any MCP server (GitHub, JIRA, custom) is a config entry away — no platform code change.
- The `ToolSpec` syntax `mcp:<server>:<glob>` resolves against pre-registered tools. Until the MCP client ships, it matches zero tools, so a team `.md` listing MCP tools fails the cascade-policy startup check.
