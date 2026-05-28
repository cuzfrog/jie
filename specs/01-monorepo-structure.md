# Monorepo Structure

```
packages/
  core/        # AgentBody, AgentSoul, EventBus client, generic tool registry
  agents/      # Per-role definitions: tool lists, subscriptions, publishes, system prompt fragments, .md prose overrides
  tools/       # All tool implementations (plain functions)
  storage/     # ArtifactStore interface + SQLite default implementation
  code-lens/   # Standalone MCP service: AST-only code structure queries
  tui/         # Tabbed terminal UI: subscribes to session events on NATS
```
