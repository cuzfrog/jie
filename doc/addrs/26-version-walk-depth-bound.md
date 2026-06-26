# ADR 26: Bound the Version Walk to a Fixed Depth

## Status

Accepted. `resolveVersion` in `packages/jie-cli/version.ts` walks the
ancestor directory chain looking for the umbrella `package.json` and
now caps the walk at `MAX_WALK_DEPTH = 10`.

## Context

`resolveVersion` was an unbounded `for (;;)` that exited only when
the parent of `dir` was `dir` (the filesystem root). In a typical
install the umbrella is reached in 2-4 hops, so the unbounded walk
was harmless. The risk surfaces in unusual environments:

- A chroot or sandbox where `dirname` returns a constant for many
  consecutive calls.
- A test runner that snapshots the FS and re-evaluates the module
  in a loop.
- A crafted deep `package.json` with `name === "@cuzfrog/jie"`
  that matches arbitrarily far down the tree (the loop trusts any
  ancestor that claims the umbrella name).

The walk is also a side-effect on module load. `import "version.ts"`
causes a read of every ancestor's `package.json` until one matches
or the root is reached. Bounding the walk keeps the side-effect
cost predictable.

## Decision

Add `MAX_WALK_DEPTH = 10` and a depth counter. Walk at most 10
levels. Bail to `FALLBACK_VERSION` ("0.0.0-dev") if no match is
found within the bound.

```ts
const MAX_WALK_DEPTH = 10;

export function resolveVersion(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    try {
      const text = readFileSync(join(dir, "package.json"), "utf-8");
      const pkg = JSON.parse(text) as PkgJson;
      if (pkg.name === UMBRELLA_NAME && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
    }
    const parent = dirname(dir);
    if (parent === dir) return FALLBACK_VERSION;
    dir = parent;
  }
  return FALLBACK_VERSION;
}
```

10 is generous for any realistic monorepo layout. The umbrella is
at the workspace root, ~2-5 levels above
`node_modules/@cuzfrog/jie/.../version.ts`. The cap also bounds
the trust radius for matching a forged umbrella `package.json`.

## Consequences

- An exotic install 11+ directories deep would report
  `0.0.0-dev` instead of the real version. This is acceptable
  for a CLI version banner; users with such layouts can override
  the version at install time.
- The fallback path is the same constant (`FALLBACK_VERSION`) as
  the original `for (;;)`'s "walked past root" exit, so observable
  behavior is unchanged for typical installs.
- AGENTS.md forbids in-code comments; the rationale for the bound
  lives here, not in `version.ts`.
