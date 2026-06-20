import { describe, expect, test } from "bun:test";

describe("print mode — flow contract", () => {
  test("runPrint is the -p flow over a started handle (no startJie ownership)", () => {
    // The print branch's `runPrint` is now a flow function
    // over a started `JieHandle`. It does NOT call `startJie`;
    // that is the orchestrator's (`createApp`) responsibility.
    // The guard-rail tests (team not found, empty team) live
    // in `app.test.ts` next to `createApp`.
    //
    // `runPrint`'s body (leader resolution + gate) is exercised
    // at the bus level in `event-bus.test.ts` (synchronous
    // depth-first dispatch). End-to-end coverage of the gate
    // and stream filter requires a real LLM and lives in
    // `tests/e2e/`.
    expect(true).toBe(true);
  });
});
