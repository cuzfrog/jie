# ADR 9: File Tools (`read_file`, `write_file`) Are Built-in Platform Tools

## Status

Accepted. Subsumes ADR 10 (write_file and the enforcement boundary).

## Context

The original spec had no file built-ins — reading was expected from an MCP server, and `write_file` was deferred on the claim that writing is "entangled" with module-boundary enforcement. The deferral forced agents onto a `cat > file <<'EOF'` bash stand-in, which lost path-safety, the LLM-facing schema, and tool telemetry .

## Decision

`read_file` and `write_file` are built-in platform tools in `packages/jie-platform/tools/`, mirroring pi's `read`/`write` tools. Enforce workspace-root containment only; module-boundary enforcement is team-level.



The default-solo team ships `[bash, read_file, write_file, notify]` and no artifact tools — the artifact store is for inter-agent coordination, and a single-agent team has no peers.

## Rationale
File I/O is a platform primitive; workspace-root containment is platform-level, module-boundary is team-level.

## Consequences

- Team layer handles module-boundary enforcement (documented in `06-agent-model.md`).
