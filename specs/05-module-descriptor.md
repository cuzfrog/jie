# Module Descriptor

The Module Descriptor is the YAML frontmatter of a `CONTEXT.md` file (filename configurable per project) located at the root of each source directory. The markdown prose below the frontmatter is the architectural narrative for that module, written and maintained by the Architect or the user.

## Schema

```yaml
---
exports:
  - file: "userService.ts"
    entries:
      - name: "getUser"
        signature: "(userId: string) => Promise<User>"
      - name: "createUser"
        signature: "(input: CreateUserInput) => Promise<User>"
  - file: "types.ts"
    entries:
      - name: "User"
        signature: "{ id: string; email: string; createdAt: Date }"
---
```

## Field Semantics

- `file` — relative to the directory the descriptor lives in.
- `entries[].name` — the public symbol name as the language understands it. For language constructs without a name (e.g. TypeScript `export default`), the language adapter assigns a synthetic name (e.g. `default`).
- `entries[].signature` — **opaque, language-defined canonical text**. The descriptor does not prescribe a grammar; the language adapter (in Code-Lens) owns extraction, canonicalization, and equality. See `10-code-lens-service.md` for the `LanguageAdapter` interface. Enforcement (the `write_file` gate that uses the adapter to compare signatures) belongs to the Module Boundary Enforcement chapter (backlog #8).

## Rules

- `path` is implicit from the directory the file resides in. No `module` field.
- No `visibility`, `dependencies`, or `forbidden_dependencies` fields in v1.
- No `last_updated`. History is managed by `git`.
- No `description` or `constraints` on entries. Authoritative descriptions live in code comments and docstrings, readable by agents via `read_file`.
- The architect is the sole author of the `CONTEXT.md` file — both halves. Two write tools, available only to the Architect soul:
  - `write_module_contract(path, frontmatter)` — writes only the YAML frontmatter.
  - `write_module_doc(path, prose)` — writes only the markdown prose body.
- Two read tools, scoped by purpose:
  - `read_module_contract(path)` — returns only the frontmatter (the **contract**). Available to roles that reason about contracts (architect, planner, implementer, reviewer).
  - `read_module_doc(path)` — returns only the prose (the **project documentation** for that module). Available to roles that consume documentation (researcher, and anyone with `read_module_contract`).

## Scope and Inheritance

- A descriptor governs **only** the files in its immediate directory. There is no transitive inheritance into subdirectories. Each directory has its own descriptor or none.

## Behavior When Descriptor is Missing

The interpretation of "directory has no descriptor" — fully frozen, unrestricted, or somewhere in between — is the concern of the **Module Boundary Enforcement** chapter (backlog #8), not of this schema.

## User vs Architect Edits

- The user may hand-edit `CONTEXT.md` (both frontmatter and prose) at any time.
- The Architect's write tools (`write_module_contract`, `write_module_doc`) each touch only their respective half of the file; the other half is preserved verbatim.
- **User-wins conflict detection**: the body internally caches the last `read_module_contract` result per path. When the architect calls `write_module_contract`, the body re-reads the file, compares the frontmatter against the cached version, and if they differ, returns a tool error (e.g. "descriptor changed since last read") — the architect must call `read_module_contract` again to accommodate the user's edit before retrying the write. The same mechanism applies to `write_module_doc` using the last `read_module_doc` result. If the architect's last read was before session start (no cache), the write proceeds and overwrites — the body only detects conflicts when a prior read-by-this-agent exists.
- Pure prose edits by the user do not block the architect's descriptor writes; conversely, pure frontmatter edits by the user do not block prose updates. The body compares only the relevant half on each write tool.

## Language Agnosticism

The descriptor format is language-neutral. Per-language behavior — what counts as "exported," how default exports are named, how a signature string is canonicalized — is the responsibility of the **language adapter** layer in the Code-Lens service. The descriptor stores whatever canonical form the adapter produces; comparisons go through the adapter. See `10-code-lens-service.md`.
