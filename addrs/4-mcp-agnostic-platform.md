# ADR 4: MCP-Agnostic Platform

## Status

Accepted.

## Context

Previous design treated Code-Lens as a special MCP server: the supervisor probed ports for it, `code_lens_url` was a first-class config field, and `09-deployment.md` dedicated a column in the process table to it. Other MCP servers (GitHub, JIRA) were referenced in role definitions but had no connection config.

## Decision

The platform has zero knowledge of specific MCP servers. All servers are configured uniformly in `mcp.yaml`:

```yaml
servers:
  <name>:
    transport: stdio | http
    # stdio: command + args
    # http: url + auth.token_env
```

The platform connects to every listed server at startup, fetches tool catalogs, and registers all tools into `ToolRegistry` as `mcp:<name>:<tool>`. Stdio subprocesses are managed by the supervisor; HTTP servers are external.

Code-Lens is just an MCP server we happen to ship in this monorepo. The CLI init flow may auto-generate its `mcp.yaml` entry for convenience, but the platform treats it identically to any other server.

## Consequences

- `code_lens_url` removed from platform config and process topology. Supervisor no longer probes ports.
- `mcp.yaml` supports project-level (`.jie/mcp.yaml`) and user-level (`~/.jie/mcp.yaml`) with override semantics.
- Any MCP server (GitHub, JIRA, custom) is a config entry away — no platform code change.
- The `ToolSpec` syntax `mcp:<server>:<glob>` resolves against pre-registered tools. The server name is the key from `mcp.yaml`.
