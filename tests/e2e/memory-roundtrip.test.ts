import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import type { Agent, AgentMessage } from "@earendil-works/pi-agent-core";
import {
  startJie,
  type MergedSettings,
} from "@cuzfrog/jie-platform";
import { SqliteStorage } from "@cuzfrog/jie-platform/storage";

function makeSettings(): MergedSettings {
  return { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" };
}

function makeStubModel() {
  return {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    api: "anthropic-messages",
    provider: "anthropic",
    baseUrl: "https://example.invalid",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };
}

/** Build a stub agent factory whose `state.messages` we can
 *  inspect. Each call to `agent.prompt()` appends a synthetic
 *  user + assistant pair to the agent's state, simulating a
 *  1-turn conversation. The body subscribes to the agent's
 *  events; we manually fire `turn_start`, `message_end`, and
 *  `agent_end` to drive the body through one turn. */
function makeTurnRecordingFactory(): {
  factory: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
  handles: Array<{
    fire: (e: import("@earendil-works/pi-agent-core").AgentEvent) => void;
    state: { messages: AgentMessage[] };
  }>;
} {
  const handles: Array<{
    fire: (e: import("@earendil-works/pi-agent-core").AgentEvent) => void;
    state: { messages: AgentMessage[] };
  }> = [];
  const factory = (
    _opts: ConstructorParameters<typeof Agent>[0],
  ): Agent => {
    const state: {
      systemPrompt: string;
      model: unknown;
      tools: unknown[];
      messages: AgentMessage[];
      isStreaming: boolean;
    } = {
      systemPrompt: "",
      model: null,
      tools: [],
      messages: [],
      isStreaming: false,
    };
    let listener: (
      e: import("@earendil-works/pi-agent-core").AgentEvent,
    ) => void = () => {};
    const agent = {
      subscribe: (l: (e: import("@earendil-works/pi-agent-core").AgentEvent) => void) => {
        listener = l;
        handles.push({ fire: l, state });
        return () => {};
      },
      state,
      continue: async () => {},
      prompt: async (msg: AgentMessage) => {
        // Append the user prompt + a synthetic assistant reply.
        state.messages.push(msg);
        const assistant: AgentMessage = {
          role: "assistant",
          content: [{ type: "text", text: `reply-${state.messages.length}` }],
          timestamp: Date.now(),
        } as unknown as AgentMessage;
        state.messages.push(assistant);
        // Fire the events the body bridges to the bus.
        listener({ type: "turn_start" });
        listener({ type: "message_start", message: assistant });
        listener({
          type: "message_end",
          message: assistant,
        });
        listener({ type: "agent_end", messages: [assistant] });
      },
    } as unknown as Agent;
    return agent;
  };
  return { factory, handles };
}

describe("memory-roundtrip — persist and resume across two startJie calls", () => {
  let workspace: string;
  let dbPath: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-mem-rt-"));
    dbPath = join(workspace, "memory.db");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("first call: 5 messages persisted; second --continue: state restored with 5 messages", async () => {
    const stub1 = makeTurnRecordingFactory();
    const first = await startJie({
      workspace,
      settings: makeSettings(),
      storage: new SqliteStorage(dbPath),
      teamId: "minimal",
      resolveModel: () => makeStubModel() as never,
      createAgent: stub1.factory,
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
    const stub2 = makeTurnRecordingFactory();
    const second = await startJie({
      workspace,
      settings: makeSettings(),
      storage: new SqliteStorage(dbPath),
      teamId: "minimal",
      continueLastSession: true,
      resolveModel: () => makeStubModel() as never,
      createAgent: stub2.factory,
    });
    // The body restored messages into the stub's state during
    // start(). The handles[0] is the leader (the only body in
    // the minimal team); its `state` is the same object the
    // body writes to.
    const leader2Handle = stub2.handles[0]!;
    expect(leader2Handle.state.messages.length).toBe(5);
    await second.stop();
  });
});
