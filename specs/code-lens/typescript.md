# TypeScript Language Adapter

The v1-only adapter in `packages/code-lens/src/adapters/typescript/`. Backed by `ts-morph` (wraps the TypeScript compiler API), implementing the `LanguageAdapter` interface defined in `service.md`.

## Project Model

The adapter bootstraps from the workspace root's `tsconfig.json`. If no tsconfig exists, it falls back to an in-memory `ts-morph` Project populated by manually added source files — keeping path aliases unresolved and `node_modules` type resolution limited to ambient `.d.ts` present in the tree.

- **Language:** `typescript`
- **Extensions:** `.ts`, `.tsx`

## Export Extraction: `extract_exports(file_path)`

### What Counts as an Export

The adapter extracts all **top-level** declarations that have an `export` modifier, plus declarations inside `export { ... }` and `export default` expressions. Exports nested inside blocks (function bodies, `if` branches) are not structural exports and are excluded.

| Declaration kind | Canonical name | Included? |
|---|---|---|
| `export function foo(...)` | `foo` | Yes |
| `export const bar = ...` | `bar` | Yes |
| `export type Baz = ...` | `Baz` | Yes |
| `export default function(...)` | `default` | Yes |
| `export default class {}` | `default` | Yes |
| `export { a, b as c }` | `a`, `c` | Yes |
| `export * from './module'` | — | Excluded (re-exports are not this file's symbols) |
| `export { x } from './module'` | `x` | Excluded (re-export, not owned) |
| `export = expr` (CJS compat) | `default` | Yes (treated as synthetic default) |
| Non-exported top-level declarations | — | No |

### Synthetic `default` Name

When a declaration has no explicit name (`export default function() {}`, `export default class {}`, `export default <expr>`), the adapter assigns the synthetic name `default`. This appears in module descriptors and signature comparisons by that name. Callers must treat `default` as a reserved synthetic symbol.

### Type-Only Exports

`export type { Foo }` and `export type Foo = ...` are extracted. Their canonical signatures are type-level (see below). The adapter does not distinguish type vs value exports at the interface boundary — both appear in the `entries` list.

### Ambient Declarations

`.d.ts` files are processed identically to `.ts` files. Declarations without bodies (e.g. `declare function foo(): void`) produce canonical signatures with parameter types but no body.

## Signature Canonicalization

Canonicalization is a **purely structural** transform — produce a deterministic, whitespace-normalized string from the AST that captures the public contract of a symbol. Bodies are always stripped.

### Canonical Form by Declaration Kind

**Function declarations** (including methods):
```
<TYPE_PARAMS>(PARAMS) => RETURN_TYPE
```
- `export function foo<T>(x: T, opts?: { debug: boolean }): Promise<T>` → `foo<T>(x: T, opts?: { debug: boolean }) => Promise<T>`
- Method signatures omit `public`/`private`/`protected` modifiers.

**Arrow functions / function expressions assigned to `const`:**
```
<TYPE_PARAMS>(PARAMS) => RETURN_TYPE
```
- `export const bar = <T>(x: T): T => x` → `bar<T>(x: T) => T`

**Classes:**
```
class NAME<TYPE_PARAMS> { PROPS; CTOR; METHODS }
```
- Properties: `P: TYPE` (one per public property/method, sorted alphabetically by name).
- Constructor: `ctor(PARAMS)` (if present).
- Methods: `m<TYPE_PARAMS>(PARAMS) => RETURN_TYPE` (only public, sorted).
- Static members prefixed with `static `.

**Interfaces:**
```
interface NAME<TYPE_PARAMS> { MEMBERS }
```
Members are `name: TYPE;` lines, each terminated by `;`, sorted alphabetically.

**Type aliases:**
```
type NAME<TYPE_PARAMS> = TYPE
```

**Enums:**
```
enum NAME { MEMBERS }
```
Members are `NAME = VALUE` (numeric auto-increment preserved from the AST, not abstracted).

**Namespaces / modules (`namespace` / `declare module`):**
Excluded in v1. Structural nesting adds complexity with no Day 1 payoff.

### Normalization Rules

- Whitespace collapsed to single spaces (including newlines).
- Semicolons normalized: exactly one `;` between class/interface members.
- Trailing commas: removed.
- Type parameter defaults: preserved (e.g. `<T = string>` stays as-is).
- Optional markers (`?`) and `readonly` modifiers: preserved.
- Access modifiers (`public`, `private`, `protected`): stripped except on properties where they affect the contract — `private` members are excluded entirely; `protected` members are excluded (v1 treats them as non-public).
- `abstract` modifier: preserved.
- `async` modifier: stripped — the return type already captures `Promise<T>`.
- `export` keyword: stripped (all entries are exported by definition).
- Generic constraints: preserved (e.g. `T extends Foo`).

## Signature Equality: `signature_equal(a, b)`

Both strings are re-parsed by the TypeScript compiler's own parser (via `ts.createSourceFile`) and canonicalized. The canonical forms are compared with exact string equality.

This means two inputs that differ only in whitespace, semicolons, or trailing commas yield the same canonical form and are equal. Two inputs with semantically different types (e.g. `string` vs `String`) yield different canonical forms and are **not** equal. The TypeScript compiler itself is the authority on what a type resolves to.

If either string fails to parse, `signature_equal` returns `false`.

## Import Graph: `import_graph(root)`

Traverses every `.ts` and `.tsx` file under `root`, extracting static import/export statements and producing `{ from, to }` edges.

### Edge Semantics

An edge `{ from: "a.ts", to: "b.ts" }` means file `a.ts` has a **static dependency** on `b.ts`. This includes `import`, `import *`, side-effect imports, and re-exports. Dynamic imports are excluded.

### Path Resolution

Resolver follows the standard TypeScript resolution algorithm using the nearest `tsconfig.json`:
1. Relative paths resolved from the importing file's directory.
2. Path aliases resolved from `compilerOptions.paths`.
3. Bare specifiers resolved from `node_modules` — if resolution fails, the edge is omitted.
4. `.ts`, `.tsx`, `.d.ts`, `/index.ts` extensions are tried in that order.

### Output Normalization

- Edges are keyed by **workspace-relative paths** from `root`.
- Output is a deduplicated set.
- Self-loops are excluded.
- Edges to `node_modules` or outside `root` are excluded.

## Caching and Performance

### File-Level Cache

The adapter caches parsed ASTs keyed by `(file_path, source_mtime)`. On subsequent calls for the same file with the same mtime, the cached AST is reused. Cache entries are invalidated when `mtime` changes.

### Import Graph Strategy

The first `import_graph(root)` call performs a full walk. Subsequent calls use incremental resolution — only files with changed `mtime` since the last call are re-parsed. If no files changed, the previous edge set is returned from cache.

### Memory

A `ts-morph` project for a mid-size codebase (~500 source files) holds roughly 80–150 MB of AST data in memory. This is acceptable for a per-team process with no other significant memory load. For very large codebases (>2000 files), lazy source-file loading is deferred past v1.

## Contract with Callers

- `extract_exports` and `import_graph` are **read-only**: they parse source files but never write to disk.
- The adapter is **not** thread-safe at the file level. The MCP server serializes requests per client session; concurrent sessions must be sequenced externally (standard MCP server dispatch).
- The adapter produces the same output for the same input regardless of invocation order or prior state.
- If a file cannot be parsed, `extract_exports` returns an empty `[]` for that file. `import_graph` omits edges involving unparseable files. Errors are logged at WARN level but do not propagate to callers.
