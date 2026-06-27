# ADR 10: `write_file` is a v1 Platform Tool; Module-Boundary Enforcement is the Team's Concern

## Status

Accepted.

## Context

ADR 9 made `read_file` a v1 platform tool. The natural sibling, `write_file`, was previously deferred to Day 2 on the rationale that its behavior is "entangled" with the **sealed-rule enforcement**: the writer would need to parse the file, extract public symbols, canonicalize, and compare against the module descriptor before writing.

The dev team's Implementer role lists `write_file` in its `tools:` frontmatter. With `write_file` deferred, the spec fell back to telling the Implementer to use `bash` + redirection (`cat > file <<'EOF' ... EOF`) and described the blueprint's `write_file` entry as "documentation only" — which contradicts the cascade policy in `10-configuration.md` (an unresolved tool in `tools:` is a startup failure).

The architectural question: is `write_file` entangled with boundary enforcement, or are these two distinct concerns that the platform and the team layer should each own?

## Decision

`write_file` is a v1 built-in platform tool that enforces only **workspace-root containment** (sibling of `read_file` per ADR 9). It does **not** enforce module boundaries, sealed rules, or any team-defined constraint.

```typescript
write_file(input: { path: string; content: string }): {
  path:          string;     // canonicalized, workspace-relative
  bytes_written: number;
  created_at:    string;     // ISO 8601 — file's mtime after the write
}
```

v1 scope:

- **Text only**, UTF-8 bytes verbatim; no binary writes, no encoding conversion.
- **Overwrite only** — idempotent. No create/append mode in v1.
- **Auto-create parent directories** (`mkdir -p` semantics).
- **Path resolution:** workspace-root constraint (resolved absolute path must start with resolved workspace root). Escapes return a tool error (`path_escape`).
- **Timeout:** inherits the platform's 120s default.

The two enforcement layers are **distinct and separable**:

| Layer | What it enforces | When it runs | v1 status |
|---|---|---|---|
| Platform `write_file` | "Inside the workspace root" | At the tool call | v1 (this ADR) |
| Team descriptor / sealed rule | "Inside the allowed module boundary" | At the role's system prompt or via a wrapper tool the team defines | jie-team backlog (Day 2) |

The minimal team ships with `[bash, read_file, write_file]` and **no artifact tools** — the artifact store is for inter-agent coordination, and a single-agent fallback has no peers.

## Rationale

- **The two enforcement layers were never actually entangled.** Workspace-root containment ("can the agent write outside the user's project?") is a security question the platform must answer. Module-boundary containment ("can the agent modify a sealed module?") is a workflow question the team answers. Conflating them blocked shipping a useful writer until an unrelated Day-2 contract was written.
- **The "documentation only" hack contradicted the cascade policy.** The cascade policy in `10-configuration.md` is strict by design: an unresolved tool in `tools:` is a hard startup failure. Calling it "documentation" was a workaround that papered over the inconsistency.
- **The bash stand-in was strictly worse.** `cat > file <<'EOF'` works but loses the platform's path-safety story (no `path_escape`), the LLM-facing TypeBox schema, and the tool telemetry. Forcing an Implementer to use `bash` to avoid a v1 platform primitive was friction without value.
- **Mirror `read_file`'s shape.** ADR 9 paired file reading with pi's `read` tool. `write_file` completes the pair. The two tools share the path-resolution policy (`path_escape` on violation), the timeout policy (120s default), and the encoding policy (UTF-8 only). They are siblings, not separate designs.

## Consequences

- `packages/jie-platform/tools/` gains a `write_file.ts` module.
- `06-agent-model.md` "Built-in Tool: `write_file`" section is a full v1 spec.
- Minimal team tool list is `[bash, read_file, write_file]`. The system prompt no longer references `read_artifact` / `write_artifact`. The "Behavior" section notes that the artifact store is omitted because there are no peers to coordinate with.
- The platform's path-resolution policy now applies uniformly to `read_file`, `write_file`, and `bash` `workdir`. All three surface `path_escape` / `workdir_escape` tool errors on violation. The error taxonomy is fully consistent.
- **Explicit Day-1 commitment:** in v1, an agent with `write_file` in its tool list can write any file inside the workspace root, including files inside a sealed module. The team layer is responsible for preventing that, not the platform. This is documented in `06-agent-model.md` "Boundary Enforcement (Platform vs Team)" so the gap is not silent.
