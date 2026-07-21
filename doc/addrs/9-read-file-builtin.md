# ADR 9: File Tools (`read_file`, `write_file`) Are Built-in Platform Tools

## Status

Accepted. Subsumes ADR 10 (write_file and the enforcement boundary).

## Context

The original spec had no file built-ins — reading was expected from an MCP server, and `write_file` was deferred on the claim that writing is "entangled" with module-boundary enforcement (the writer would have to parse files and check the module descriptor). The deferral forced agents onto a `cat > file <<'EOF'` bash stand-in, which lost path-safety, the LLM-facing schema, and tool telemetry — and contradicted the cascade policy (`10-configuration.md`), which makes an unresolved tool in `tools:` a startup failure.

## Decision

`read_file` and `write_file` are built-in platform tools in `packages/jie-platform/tools/`, mirroring pi's `read`/`write` tools. They enforce **workspace-root containment only** — resolved absolute path must stay inside the resolved workspace root, `path_escape` / `workdir_escape` tool errors on violation, consistently across `read_file`, `write_file`, and `bash` `workdir`. They do **not** enforce module boundaries, no-new-exports rules, or any team-defined constraint; that is the team's concern (see `06-agent-model.md` "Boundary Enforcement (Platform vs Team)").

```typescript
read_file(input: { path: string; offset?: number; limit?: number }): { content: string; truncated: { content: boolean } }
write_file(input: { path: string; content: string }): { path: string; bytes_written: number; created_at: string }
```

Shared scope: UTF-8 text only; 120s default timeout. `read_file` truncates at 2000 lines or 50 KiB, whichever first; image MIME types are a tool error (`unsupported_media_type`). `write_file` overwrites (idempotent, no append mode) and auto-creates parent directories.

The minimal team ships `[bash, read_file, write_file, notify]` and no artifact tools — the artifact store is for inter-agent coordination, and a single-agent team has no peers.

## Rationale

- **File I/O is a platform-level primitive.** Any agent that inspects source, config, or artifacts needs it; making teams wire up an MCP server for basic reads is friction without value.
- **Mirror pi.** Pi is the runtime underneath Jie and already feeds file contents to the LLM; same shape means the LLM reasons about the tools the same way.
- **The two enforcement layers were never entangled.** Workspace-root containment ("can the agent write outside the user's project?") is a security question the platform answers. Module-boundary containment is a workflow question the team answers. Conflating them blocked a useful writer on an unrelated Day-2 contract.
- **The bash stand-in was strictly worse.** No `path_escape`, no schema, no telemetry.

## Consequences

- **Explicit Day-1 commitment:** an agent with `write_file` can write any file inside the workspace root, including files inside a no-new-exports module. The team layer is responsible for preventing that, not the platform. The gap is documented in `06-agent-model.md` so it is not silent.
