# Monorepo Structure

```
packages/
  core/        # AgentBody, AgentSoul, EventBus client, tool registry
  agents/      # Soul definitions: dm, architect, researcher, planner, implementer, reviewer (Plain md file definition with frontmatter)
  tools/       # All tool implementations (plain functions)
  storage/     # ArtifactStore interface + SQLite default implementation
  code-lens/   # Standalone MCP service: AST-only code structure queries
  tui/         # Tabbed terminal UI: subscribes to session events on NATS
```
