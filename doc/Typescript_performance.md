# TypeScript performance

Reference distilled from <https://github.com/microsoft/TypeScript/wiki/Performance>. The points here are the ones relevant to this codebase; full list is in the wiki.

## Why we care

Before fix: `bun x tsc --noEmit --extendedDiagnostics` showed 1.2M type instantiations and 6s total time. After replacing two custom conditional types with type-map lookups, instantiations dropped to 0 and total time to 1.7s.

| Metric | Before | After |
|---|---|---|
| Types | 159,121 | 85 |
| Instantiations | 1,203,125 | 0 |
| Memory | 577 MB | 204 MB |
| Total time | 6.0 s | 1.7 s |

## Avoid conditional types for hot call sites

Per the wiki's "Naming Complex Types" section, every time a generic function is called, TypeScript re-runs the conditional type. Extracting to a named alias helps the compiler cache the result, but the conditional is still re-evaluated.

For dispatch-style interfaces (one method, multiple payload shapes per key), prefer a flat type map with indexed lookup:

```typescript
// Slow: conditional evaluated at every call site.
export type AgentEventPayload<T extends string> =
  T extends "agent.tool.call" ? { tool_call_id: string; name: string; input: unknown } :
  T extends "agent.tool.result" ? { tool_call_id: string; name: string; output: unknown; durationMs: number; error: string | null } :
  ...
  : Record<string, unknown>;

export interface AgentEventPublisher {
  publish<T extends string>(topic: T, payload: AgentEventPayload<T>): void;
}

// Fast: lookup into a flat object type. `keyof Map` and `Map[T]` are cached.
export interface AgentEventPayloadMap {
  "agent.tool.call": { tool_call_id: string; name: string; input: unknown };
  "agent.tool.result": { tool_call_id: string; name: string; output: unknown; durationMs: number; error: string | null };
  ...
}
export type AgentEventPayload<T extends keyof AgentEventPayloadMap> = AgentEventPayloadMap[T];

export interface AgentEventPublisher {
  publish<T extends keyof AgentEventPayloadMap>(topic: T, payload: AgentEventPayloadMap[T]): void;
}
```

`Extract<T, U>` is also a built-in conditional. For a discriminated union with N variants, `Extract<Union, { kind: "x" }>` walks pairwise (O(N²)). Replace with a flat type-map lookup: `MyArgsMap["x"]`.

## Naming complex types helps caching

Per the wiki: "If the return type ... was extracted out to a type alias, more information can be cached by the compiler." Always extract complex conditional types to named aliases — but the lookup-map pattern above is strictly faster.

## tsconfig.json settings

The wiki's three highest-impact config flags. All three are already set in this repo:

- `skipLibCheck: true` — skip type-checking `.d.ts` files. Lines of Definitions in this project is 181k; most are external `.d.ts`.
- `types: ["bun", "node"]` — restrict automatic `@types` inclusion. Without this, tsc scans every `@types/*` package in `node_modules`.
- `strict: true` — enables `strictFunctionTypes`, which lets tsc use faster variance checks instead of structural comparison for generic assignability.

`incremental: true` (now enabled) — saves a `.tsbuildinfo` file so subsequent `tsc` invocations can skip unchanged files.

## Prefer interfaces over intersections

Per the wiki: "Interfaces ... display consistently better, whereas type aliases to intersections can't be displayed in part of other intersections. Type relationships between interfaces are also cached, as opposed to intersection types as a whole."

```typescript
// Slow: intersection
type Foo = Bar & Baz & { someProp: string };

// Fast: interface
interface Foo extends Bar, Baz {
  someProp: string;
}
```

## Prefer base types over large unions

Per the wiki: unions larger than ~12 members slow assignability checks because TypeScript compares pairs (O(N²)). Prefer subtypes that extend a common base:

```typescript
// Slow: large union
type Shape = Circle | Square | Triangle | ... | Pentagon | Hexagon;
declare function area(s: Shape): number;

// Fast: subtype hierarchy
interface Shape { kind: string }
interface Circle extends Shape { kind: "circle"; radius: number }
interface Square extends Shape { kind: "square"; side: number }
declare function area(s: Shape): number;
```

## Things to avoid

- `any` — defeats type checking; use `unknown` and narrow.
- Recursive types — TypeScript has limited recursion depth.
- `infer` in deeply nested positions — slower than explicit type parameters.

## Investigating slow compilations

Run with diagnostics:

```sh
bun x tsc --noEmit --extendedDiagnostics
```

Look at:
- `Check time` — type-checking time (the bulk of cost for most projects).
- `Instantiations` — count of generic type instantiations. High numbers (>100k) suggest hot conditional types.
- `Memory used` — types in memory at peak.

The wiki's `Common Issues` section has more: `listFilesOnly`, `traceResolution`, `explainFiles`, performance tracing.

## This codebase

Custom conditional types in source code (none after the fix):

```sh
grep -rn "T extends.\\?: " packages/ --include="*.ts"
grep -rn "Extract<" packages/ --include="*.ts"
```

Both should return zero matches. If a new conditional type is added, prefer the type-map pattern above.

## References

- <https://github.com/microsoft/TypeScript/wiki/Performance>
- <https://github.com/microsoft/typescript-go> — TypeScript 7 in Go, native, often 10x faster.