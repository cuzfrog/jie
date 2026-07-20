# no-new-exports Rule

> **Deferred to its own chapter.** See `module-boundary-enforcement.md` (TBD).

The no-new-exports rule — the enforcement that prevents agents from changing public/exported signatures except via Architect-authored descriptor updates — is the central concern of a dedicated **Module Boundary Enforcement** chapter. That chapter owns:

- The `write_file` gate algorithm (parse, extract public symbols, canonicalize, compare against descriptor).
- The behavior when no descriptor exists for a directory (default policy: no-new-exports, requiring explicit Architect approval to change boundaries).
- Cross-file type reference handling.
- The language-adapter interface that performs symbol extraction and signature canonicalization per language.
- Failure modes: how a denied write is reported.

## Invariants Already Established

These hold regardless of how enforcement is implemented:

1. The Module Descriptor is the source of truth for module contracts (see `03-module-descriptor.md`).
2. Only the Architect's `write_module_contract` tool changes contracts.
3. Signature semantics are language-defined; the descriptor stores opaque canonical text produced by language adapters.
4. The default for a directory without a descriptor is **no-new-exports** — module boundaries are not implicitly opened up; the Architect must approve any change explicitly.
