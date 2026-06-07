# Monorepo Structure

## Package Layout

```
packages/
  code-lens/      # Standalone MCP server: AST-only code structure queries
  jie-platform/   # Platform runtime lib — barrel entry: index.ts
    core/           # AgentBody, AgentSoul, EventBus, Tool interface & registry
    storage/        # ArtifactStore interface + SQLite default implementation
    tools/          # Built-in tools: notify, bash, read_file, write_file, web_search, web_fetch, write_artifact, read_artifact
    team/           # Team-blueprint loader: parses .md files, builds AgentSoul[] — agnostic of jie-team
    index.ts        # Barrel: re-exports all public APIs
  jie-tui/        # Terminal UI: renders agent streams, tool calls, pipeline events
  jie-cli/        # CLI entry point (jie binary) — supervisor + command dispatch
  jie-team/       # Manifest + install: ships dev team and minimal team as .md files; postinstall script copies them to user/project teams folders
```

## Dependencies

```
jie-cli → jie-platform  (types, AgentBody, EventBus, ArtifactStore, MemoryManager)
jie-cli → jie-tui       (import TUI component, pass EventBus + ArtifactStore refs)
jie-cli → jie-team      (jie team install command only — invokes jie-team's install logic)
jie-tui → jie-platform  (types, event envelope shapes)
jie-team → jie-platform (types: AgentSoul, ToolSpec — dev only, erased at runtime)
code-lens               (standalone — no jie dependencies)
```

**Agnosticism rule (ADR 12).** `jie-platform` has zero runtime dependency on `jie-team` — no `import` in any form, including types. The platform reads team manifests from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`). The `jie-team` package owns the distribution of the bundled teams (dev team, minimal team) via its `postinstall` script; after install, the manifests live at the standard paths and the platform finds them by name.

## Build System

**Zero build step.** The runtime is `bun` (>= 1.3.14), which executes TypeScript natively. No compilation, no bundling, no transpilation. Source `.ts` files are the distributable.

- **Monorepo tool**: bun workspaces. Root `package.json` declares `workspaces: ["packages/*"]`.
- **No build script**: Distributing TypeScript source executed by bun.

## Package Entry Points

```jsonc
// packages/jie-platform/package.json
{
  "name": "@cuzfrog/jie-platform",
  "exports": { ".": "./index.ts" }
}

// packages/jie-tui/package.json
{
  "name": "@cuzfrog/jie-tui",
  "exports": { ".": "./index.ts" }
}

// packages/jie-team/package.json
{
  "name": "@cuzfrog/jie-team",
  "files": ["teams/", "scripts/"],
  "exports": { ".": "./index.ts" },
  "scripts": {
    "postinstall": "bun run scripts/install.ts"
  }
}
```

`jie-platform/index.ts` re-exports all public types: `AgentBody`, `AgentSoul`, `EventBus`, `Tool`, `ToolRegistry`, `ArtifactStore`, `MemoryManager`, `ExecutionContext`.

`jie-tui/index.ts` exports the TUI component function: `startTUI(options: { bus: EventBus, artifacts: ArtifactStore, roles: string[] })`.

## Umbrella Package

```jsonc
// package.json (root)
{
  "name": "@cuzfrog/jie",
  "workspaces": ["packages/*"],
  "dependencies": {
    "@cuzfrog/jie-platform": "workspace:*",
    "@cuzfrog/jie-tui": "workspace:*",
    "@cuzfrog/jie-team": "workspace:*",
    "@cuzfrog/code-lens": "workspace:*"
  },
  "bin": {
    "jie": "packages/jie-cli/index.ts"
  }
}
```

`bun install -g @cuzfrog/jie` installs the workspace set. The binary is `jie` → `packages/jie-cli/index.ts`. **jie-team is in `dependencies` so its `postinstall` script runs** — the script copies the bundled team manifests to `~/.jie/teams/`. The platform itself does not import jie-team at runtime.

## Testing

- **Framework**: `bun test`. Zero extra dependencies, Jest/vitest-compatible API.
- **Unit/Integration**: co-located `*.test.ts` files alongside source.
- **E2E**: `tests/e2e/` at repo root. Spin up a full team (EventBus + AgentBodies + ArtifactStore), inject prompts via EventBus, verify pipeline events and artifact store outcomes.
- **Command**: `bun test` runs all tests across the workspace.
