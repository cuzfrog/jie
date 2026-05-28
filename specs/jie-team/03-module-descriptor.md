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
- `entries[].name` — the public symbol name as the language understands it.
- `entries[].signature` — **opaque, language-defined canonical text**. The language adapter (in Code-Lens) owns extraction, canonicalization, and equality. See `jie-platform/06-code-lens/service.md` for the `LanguageAdapter` interface.

## Rules

- No `visibility`, `dependencies`, or `forbidden_dependencies` fields in v1.
- No `last_updated`. History is managed by `git`.
- The architect is the sole author of the `CONTEXT.md` file — both halves. Two write tools, available only to the Architect soul:
  - `write_module_contract(path, frontmatter)` — writes only the YAML frontmatter.
  - `write_module_doc(path, prose)` — writes only the markdown prose body.
- Two read tools, scoped by purpose:
  - `read_module_contract(path)` — returns only the frontmatter. Available to roles that reason about contracts (architect, planner, implementer, reviewer).
  - `read_module_doc(path)` — returns only the prose. Available to roles that consume documentation (researcher, and anyone with `read_module_contract`).

## Scope and Inheritance

- A descriptor governs **only** the files in its immediate directory. There is no transitive inheritance into subdirectories. Each directory has its own descriptor or none.

## Behavior When Descriptor is Missing

The interpretation of "directory has no descriptor" — fully frozen, unrestricted, or somewhere in between — is the concern of the **Module Boundary Enforcement** chapter (see `04-frozen-rule.md`).

## User vs Architect Edits

- The user may hand-edit `CONTEXT.md` at any time.
- The Architect's write tools touch only their respective half of the file; the other half is preserved verbatim.
- **User-wins conflict detection**: the body internally caches the last read result per path. When the architect calls a write tool, the body re-reads the file, compares the relevant half against the cached version, and if they differ, returns a tool error — the architect must re-read before retrying the write.

## Language Agnosticism

The descriptor format is language-neutral. Per-language behavior — what counts as "exported," how default exports are named, how a signature string is canonicalized — is the responsibility of the **language adapter** layer in the Code-Lens service. The descriptor stores whatever canonical form the adapter produces.
