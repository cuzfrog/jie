# 28 — node-pty + bun compatibility gap in jie-ink tests

## Status

Accepted. Documented as a known limitation, not a defect to fix.

## Context

`packages/jie-ink` is the vendored copy of `ink` 7.1.0 used by `@cuzfrog/jie-tui`. The original upstream test suite relies on `node-pty` to spawn a real PTY for end-to-end keyboard input tests. We adopted bun as the test runner to drop ava + sinon.

`node-pty` does not interoperate with bun's child-process model in two ways:

1. The `onData` callback that node-pty exposes for capturing PTY output does not fire under bun — the child process runs, but the test never sees what it wrote. This breaks the assertion path in every test that exercises real terminal input (`use-input-*.test.tsx`, `App.test.tsx`, `AppContext.test.tsx` "suspendTerminal" subtest, etc.).
2. The `spawn` helper that node-pty provides exits with code 1 in bun without producing any captured output, surfacing as `Process exited with non-zero exit code: 1`.

The tests we cannot run on bun are exactly the ones that need a real PTY (raw-mode keyboard input, escape-sequence parsing against a terminal emulator, suspend/resume handoff to a child process). Replacing them with a higher-level in-process simulation would mean re-implementing the parts of a terminal that `ink` is built to abstract over — net negative.

## Decision

Mark every test that depends on `node-pty` as `test.skip` rather than rewriting it. The skipped count is recorded in the bun summary banner (`144 skip` at the time of writing). Anything we can test without a PTY — render output, hook semantics in isolation, reconciliation behaviour — is covered by the 883 passing tests.

The `node-pty` dev-dependency stays declared so the original upstream tests are still runnable if/when the project switches back to node. There is no production path through `node-pty`.

## Consequences

- A future migration back to node (or a switch to vitest under node) would re-enable the skipped tests with no code changes — only the `test.skip` calls would need to drop.
- Bun-specific test infrastructure (`vi.useFakeTimers`, `vi.advanceTimersByTime`, the local `patch-console` in `src/patch-console.ts`) is the only piece that diverges from upstream ink's test code. Reverting it on a runner switch is mechanical.
- We do not block on PTY coverage. The skipped tests are integration tests over a real terminal; the unit-level coverage of the same code paths (input parser, kitty keyboard, terminal sizing, raw mode) is in the passing suite.
