# Monorepo Structure

```
packages/
  code-lens/      # Standalone MCP server: AST-only code structure queries
  jie-platform/   # Platform runtime
    core/           # AgentBody, AgentSoul, EventBus client, Tool interface & registry
    storage/        # ArtifactStore interface + SQLite default implementation
    tools/          # Built-in tools: notify, bash, web_search, web_fetch (pluggable Tool interface)
    team/           # Interface for team-blueprint and build the workflow
    tui/            # Tabbed terminal UI: subscribes to session events on NATS
  jie-team/       # Team-specific: role definitions, workflow blueprints, built-in dev team
```
