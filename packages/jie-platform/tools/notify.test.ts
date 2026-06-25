import { describe, expect, test } from "bun:test";
import {
  createEventManager,
  type EventManager,
} from "../core/index.ts";
import type { ArtifactStore } from "../storage/index.ts";
import type { ExecutionContext } from "./types.ts";
import { createNotifyTool } from "./notify.ts";
import { JiePlatformError } from "../domain-types.ts";

interface NotifyEnvelope {
  version: 1;
  type: string;
  sender: { kind: "agent"; identity: { teamId: string; agentRole?: string; agentKey?: string } } | { kind: "cli" } | { kind: "tui" };
  timestamp: string;
  payload: { prompt: string; source: string };
}

function makeCtx(): ExecutionContext {
  return {
    sessionId: "sess-1",
    teamId: "t1",
    agentKey: "leader-1",
    agentRole: "leader",
    artifactStore: stubArtifactStore(),
  };
}

function stubArtifactStore(): ArtifactStore {
  return {
    write: async () => {
      throw new Error("stub: not implemented");
    },
    read: async () => {
      throw new Error("stub: not implemented");
    },
    list: async () => [],
  };
}

interface Harness {
  events: EventManager;
  received: Array<{ subject: string; env: NotifyEnvelope }>;
}

function makeHarness(): Harness {
  const events = createEventManager();
  const received: Array<{ subject: string; env: NotifyEnvelope }> = [];
  events.subscribe("t1.task", (env) => {
    received.push({ subject: env.type, env: env as unknown as NotifyEnvelope });
  });
  return { events, received };
}

describe("notify — topic validation", () => {
  test("rejects empty topic with notify_invalid_topic: empty", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    let caught: unknown;
    try {
      await tool.execute({ topic: "", prompt: "x" }, makeCtx());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe("notify_invalid_topic: empty");
  });

  test("rejects topic starting with `agent.`", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    let caught: unknown;
    try {
      await tool.execute({ topic: "agent.idle", prompt: "x" }, makeCtx());
    } catch (e) {
      caught = e;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: starts_with_agent_prefix",
    );
  });

  test("rejects topic starting with the body's team_id", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    const ctx = makeCtx();
    let caught: unknown;
    try {
      await tool.execute({ topic: `${ctx.teamId}.task`, prompt: "x" }, ctx);
    } catch (e) {
      caught = e;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: starts_with_team_prefix",
    );
  });

  test("rejects topic containing a null byte", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    let caught: unknown;
    try {
      await tool.execute({ topic: "bad\0topic", prompt: "x" }, makeCtx());
    } catch (e) {
      caught = e;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: contains_null_byte",
    );
  });
});

describe("notify — valid publish path", () => {
  test("publishes a full envelope to {team_id}.{topic}", async () => {
    const { events, received } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });

    const ctx = makeCtx();
    const before = Date.now();
    await tool.execute({ topic: "task", prompt: "hello" }, ctx);
    const after = Date.now();

    expect(received).toHaveLength(1);
    const { subject, env } = received[0]!;
    expect(subject).toBe("t1.task");
    expect(env.version).toBe(1);
    expect(env.type).toBe("t1.task");
    expect(env.sender.kind).toBe("agent");
    if (env.sender.kind === "agent") {
      expect(env.sender.identity.teamId).toBe("t1");
      expect(env.sender.identity.agentRole).toBe("leader");
      expect(env.sender.identity.agentKey).toBe("leader-1");
    }
    expect(env.payload).toEqual({ prompt: "hello", source: "leader-1" });
    const ts = new Date(env.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test("LLM-facing content is the > 0 variant when there are recipients", async () => {
    const events = createEventManager();
    events.subscribe("t1.task", () => {});
    events.subscribe("t1.task", () => {});
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe("Notification delivered to 2 recipients");
    expect(result.terminate).toBeUndefined();
  });

  test("LLM-facing content is the 0 variant when no peer is listening", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    const result = await tool.execute(
      { topic: "ghost", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe(
      "Notification delivered to 0 recipients — no agent is subscribed to 'ghost'",
    );
  });

  test("`details = { topic, recipients }` is returned for afterToolCall hooks", async () => {
    const events = createEventManager();
    events.subscribe("t1.task", () => {});
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task", recipients: 1 });
  });

  test("recipients count subtracts 1 when the publisher is itself subscribed", async () => {
    const events = createEventManager();
    events.subscribe("t1.task", () => {});
    const tool = createNotifyTool({
      events,
      isSelfSubscribed: (topic) => topic === "task",
    });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task", recipients: 0 });
    expect(result.content).toContain("0 recipients");
  });

  test("recipients is not negative when the publisher is the only subscriber", async () => {
    const events = createEventManager();
    events.subscribe("t1.task", () => {});
    const tool = createNotifyTool({
      events,
      isSelfSubscribed: () => true,
    });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task", recipients: 0 });
  });

  test("does not end the LLM turn (terminate not set)", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.terminate).toBeUndefined();
  });

  test("tool metadata: name, description, label, parameters", () => {
    const events = createEventManager();
    const tool = createNotifyTool({ events, isSelfSubscribed: () => false });
    expect(tool.name).toBe("notify");
    expect(tool.label).toBe("Notify");
    expect(tool.description).toContain("Publish a message");
    expect(tool.description).toContain("topic");
    expect(tool.description).toContain("prompt");
  });
});