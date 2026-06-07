# ADR 10: `read_file` as a Built-in Tool

## Status

Accepted.

## Context

The dev team blueprint (`jie-team/01-role-definitions.md`) lists `read_file` in the Implementer and Reviewer tool lists. The original `jie-platform` spec did not have a `read_file` built-in — file reading was implicitly expected to come from an MCP server (e.g. `mcp:code-lens:read_file`). The glossary (`00-overview.md`) used `read_file` as the bare-name example for the Tool Registry, which was misleading: a bare name implies a built-in, but the only provider at the time was MCP.

The architectural question: should file reading be a platform-level primitive, or should it remain team-/MCP-provided?

## Decision

`read_file` is a built-in platform tool in `jie-platform/tools/`, mirroring pi's `read` tool (`@earendil-works/pi-coding-agent/src/core/tools/read.ts`):

```typescript
read_file(input: { path: string; offset?: number; limit?: number }): {
  content: string;
  truncated: { content: boolean };
}
```

v1 scope:

- **Text only.** Image MIME types (`image/jpeg`, `image/png`, `image/gif`, `image/webp`) return a tool error (`unsupported_media_type`). Image attachment support is a Day 2 extension.
- **Default truncation:** 2000 lines OR 50 KiB, whichever is hit first.
- **Path resolution:** workspace-root constraint (resolved absolute path must start with resolved workspace root). Escapes return a tool error (`path_escape`).
- **Encoding:** UTF-8. No charset detection in v1.
- **Timeout:** inherits the platform's 120s default (effectively never fires; reads are synchronous and bounded).

`write_file` is **not** in v1. Its behavior is entangled with the frozen-rule enforcement (jie-team backlog #8 — Module Boundary Enforcement chapter). Until that contract is defined, the dev team Implementer uses `bash` + redirection as a stand-in. The blueprint lists `write_file` to document the intended Day 2 surface.

## Rationale

- **File reading is platform-level.** It is a universal primitive — any agent (DM, Researcher, Implementer, Reviewer, etc.) that inspects source code, configuration, or any artifact needs it. Making teams wire up an MCP server for basic file I/O is friction without value.
- **Mirror pi's `read`.** Pi is the agent runtime underneath Jie. The pi agent already invokes `read` to feed file contents back to the LLM. Jie's `read_file` is a typed, workspace-bounded wrapper with the same shape — agents can reason about it the same way they would about pi's tool.
- **Text-only is sufficient for v1.** The dev team reads source code, plan artifacts (Markdown), and module contracts. None of these require image attachment. Adding image support would mean threading attachment handling through pi-agent's message format — useful but deferrable.
- **`write_file` waits for the frozen rule.** Writing to the workspace is the central concern of the Module Boundary Enforcement chapter (jie-team backlog #8). It must parse, extract public symbols, canonicalize, and compare against the module descriptor before writing. Shipping a `write_file` without that contract would be a footgun — agents would silently violate module boundaries.

## Consequences

- `packages/jie-platform/tools/` gains a `read_file.ts` module.
- Built-in tool list in `monorepo-structure.md` and `00-overview.md` updated.
- The dev team blueprint (`01-role-definitions.md`) needs no change — `read_file` was already in the Implementer/Reviewer tool lists; v1 simply resolves it to a real implementation rather than a missing tool.
- The Implementer's `write_file` reference is preserved as a forward-looking note. Implementer uses `bash` for writes in v1.
- The platform's path-resolution policy (workspace-root containment) now applies to two tools (`bash` workdir, `read_file` path) — both surface `path_escape` / `workdir_escape` tool errors on violation. The error taxonomy is consistent.