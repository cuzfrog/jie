# ADR 11: `write_file` is a v1 Platform Tool; Module-Boundary Enforcement is the Team's Concern

## Status

Accepted. Supersedes the "write_file is Day 2" stub that previously lived in `05-agent-model.md`.

## Context

ADR 10 made `read_file` a v1 platform tool. The natural sibling, `write_file`, was deferred to Day 2 on the rationale that its behavior is "entangled" with the **frozen-rule enforcement** (jie-team backlog #8 — Module Boundary Enforcement): the writer would need to parse the file, extract public symbols, canonicalize, and compare against the module descriptor before writing.

The dev team blueprint's Implementer role lists `write_file` in its `tools:` frontmatter (`jie-team/01-role-definitions.md`). With `write_file` deferred, the spec fell back to telling the Implementer to use `bash` + redirection (`cat > file <<'EOF' ... EOF`) and described the blueprint's `write_file` entry as "documentation only" — which contradicts the cascade policy in `10-configuration.md` (an unresolved tool in `tools:` is a startup failure).

The architectural question: is `write_file` entangled with boundary enforcement, or are these two distinct concerns that the platform and the team layer should each own?

## Decision

`write_file` is a v1 built-in platform tool that enforces only **workspace-root containment** (sibling of `read_file` per ADR 10). It does **not** enforce module boundaries, frozen rules, or any team-defined constraint.

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
| Team descriptor / frozen rule | "Inside the allowed module boundary" | At the role's system prompt or via a wrapper tool the team defines | jie-team backlog #8 (Day 2) |

The minimal team (`jie-platform/minimal-team.md`) ships with `[bash, read_file, write_file]` and **no artifact tools** — the artifact store is for inter-agent coordination, and a single-agent fallback has no peers. The dev team's Implementer role gets `write_file` directly; its module-boundary behavior is added on top in Day 2 by jie-team's contract.

## Rationale

- **The two enforcement layers were never actually entangled.** Workspace-root containment ("can the agent write outside the user's project?") is a security question the platform must answer. Module-boundary containment ("can the agent modify a frozen module?") is a workflow question the team answers. Conflating them blocked shipping a useful writer until an unrelated Day-2 contract was written.
- **The "documentation only" hack contradicted the cascade policy.** The cascade policy in `10-configuration.md` is strict by design: an unresolved tool in `tools:` is a hard startup failure. Calling it "documentation" was a workaround that papered over the inconsistency.
- **The bash stand-in was strictly worse.** `cat > file <<'EOF'` works but loses the platform's path-safety story (no `path_escape`), the LLM-facing TypeBox schema, and the tool telemetry (`agent.tool.call` / `agent.tool.result` get the right shape). Forcing the Implementer to use `bash` to avoid a v1 platform primitive was friction without value.
- **The dev team's v1 still ships.** With `write_file` in v1, the Implementer role's `tools:` list resolves successfully. Module-boundary enforcement is jie-team's concern and arrives with jie-team backlog #8 — it does not block the platform writer.
- **Mirror `read_file`'s shape.** ADR 10 paired file reading with pi's `read` tool. `write_file` completes the pair. The two tools share the path-resolution policy (`path_escape` on violation), the timeout policy (120s default), and the encoding policy (UTF-8 only). They are siblings, not separate designs.

## Consequences

- `packages/jie-platform/tools/` gains a `write_file.ts` module.
- `05-agent-model.md` "Built-in Tool: `write_file`" section is now a full v1 spec, not a Day 2 stub.
- Minimal team tool list updated from `[bash, write_artifact, read_artifact]` to `[bash, read_file, write_file]`. The system prompt no longer references `read_artifact` / `write_artifact`. The "Behavior" section notes that the artifact store is omitted because there are no peers to coordinate with.
- `monorepo-structure.md` `tools/` directory comment and `00-overview.md` built-in tool list updated to include `write_file`.
- The dev team blueprint (`jie-team/01-role-definitions.md`) needs **no change** for v1: its Implementer `tools:` already lists `write_file`, and the platform now resolves it. The Day-2 module-boundary check (jie-team backlog #8) will wrap the platform's writer on the team side.
- The platform's path-resolution policy now applies uniformly to `read_file`, `write_file`, and `bash` `workdir`. All three surface `path_escape` / `workdir_escape` tool errors on violation. The error taxonomy is fully consistent.
- **Explicit Day-1 commitment:** in v1, an agent with `write_file` in its tool list can write any file inside the workspace root, including files inside a frozen module. The team layer is responsible for preventing that, not the platform. This is documented in `05-agent-model.md` "Boundary Enforcement (Platform vs Team)" so the gap is not silent.
- ADR 10 (read_file) is amended to drop the "write_file waits for the frozen rule" rationale and consequence; that territory now belongs to this ADR.
