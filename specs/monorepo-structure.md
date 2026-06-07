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
  jie-team/       # Manifest package: ships dev team and minimal team as .md files. No runtime / install surface — users copy manifests into the standard paths by hand.
```

## Dependencies

```
jie-cli → jie-platform  (types, AgentBody, EventBus, ArtifactStore, MemoryManager)
jie-cli → jie-tui       (import TUI component, pass EventBus + ArtifactStore refs)
jie-tui → jie-platform  (types, event envelope shapes)
jie-team → jie-platform (types: AgentSoul, ToolSpec — dev only, erased at runtime)
code-lens               (standalone — no jie dependencies)
```

`jie-team` is a sibling of the platform, not a dependency. The CLI does not depend on it; the platform does not import it. `jie-team` is a manifest package — a folder of `.md` files that users place at the standard paths by hand.

**Agnosticism rule (ADR 12).** `jie-platform` has zero runtime dependency on `jie-team` — no `import` in any form, including types. The platform reads team manifests from filesystem paths (`.jie/teams/<id>/`, `~/.jie/teams/<id>/`). The `jie-team` package is a passive source of manifests, not an install hook; the user copies its files into the standard paths.

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
  "files": ["teams/"]
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
    "@cuzfrog/code-lens": "workspace:*"
  },
  "bin": {
    "jie": "packages/jie-cli/index.ts"
  }
}
```

`bun install -g @cuzfrog/jie` installs the workspace set. The binary is `jie` → `packages/jie-cli/index.ts`. `jie-team` is a workspace package, not a runtime dependency — its manifests are available as files in the repo, not as something the platform or CLI loads at runtime.

## Testing

- **Framework**: `bun test`. Zero extra dependencies, Jest/vitest-compatible API.
- **Unit/Integration**: co-located `*.test.ts` files alongside source.
- **E2E**: `tests/e2e/` at repo root. Spin up a full team (EventBus + AgentBodies + ArtifactStore), inject prompts via EventBus, verify pipeline events and artifact store outcomes.
- **Command**: `bun test` runs all tests across the workspace.
