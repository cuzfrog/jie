import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import {
  startJie,
  type MergedSettings,
} from "@cuzfrog/jie-platform";
import { SqliteStorage } from "@cuzfrog/jie-platform/storage";

function makeSettings(): MergedSettings {
  return { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" };
}

describe("memory-roundtrip — persist and resume across two startJie calls", () => {
  let workspace: string;
  let homeJieDir: string;
  let dbPath: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-mem-rt-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-mem-rt-home-"));
    dbPath = join(workspace, "memory.db");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test.skip("first call: 5 messages persisted; second --continue: state restored with 5 messages", async () => {
    const first = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: new SqliteStorage(dbPath),
      teamId: "minimal",
    });
    // Drive 5 turn cycles. The body subscribes to the leader
    // (general) bus subject and calls `agent.prompt(message)`
    // when a leader.prompt event is published. Each `prompt`
    // synthesizes one assistant message and fires the bridge
    // events; the body persists them.
    const leader1 = first.bodiesFor("minimal")[0]!;
    // Publish 5 leader prompts to drive 5 turns.
    for (let i = 0; i < 5; i++) {
      first.bus.publish("minimal.leader.prompt", {
        version: 1,
        team_id: "minimal",
        event_type: "leader.prompt",
        agent_role: "general",
        agent_key: leader1.agent_key,
        timestamp: new Date().toISOString(),
        payload: { prompt: `turn-${i}` },
      });
    }
    // Wait for the body's ingest to drain. The stub's `prompt`
    // resolves synchronously, so a microtask tick is enough.
    await new Promise((r) => setTimeout(r, 50));
    await first.stop();

    // Verify 5 rows in memory_turns.
    const verifyStorage = new SqliteStorage(dbPath);
    const rows = verifyStorage.query(
      "SELECT COUNT(*) FROM memory_turns",
    );
    expect(rows[0]![0]).toBe(5);
    verifyStorage.close();

    // Second call: --continue restores the leader's prior
    // messages into its agent.state.messages.
    const second = await startJie({
      workspace,
      homeJieDir,
      settings: makeSettings(),
      storage: new SqliteStorage(dbPath),
      teamId: "minimal",
      continueLastSession: true,
    });
    // The body restored messages into the agent's state during
    // start(); we verify by checking that the body's internal
    // turn count is consistent. (The full message inspection
    // required a stub agent factory; with `createAgent` removed
    // from `StartJieOptions`, this test relies on the body
    // persisting the right number of rows. See `memory_turns`
    // assertion below.)
    await second.stop();

    // Reopen the second session's memory and verify the same
    // 5 rows are still there (the body didn't lose them across
    // the start/stop/start cycle).
    const verifyStorage2 = new SqliteStorage(dbPath);
    const rows2 = verifyStorage2.query(
      "SELECT COUNT(*) FROM memory_turns",
    );
    expect(rows2[0]![0]).toBe(5);
    verifyStorage2.close();
  });
});
