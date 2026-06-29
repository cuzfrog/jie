import {
  createEventManager,
  type EventEnvelope,
  type EventManager,
} from "../event";
import type { ArtifactStore } from "../storage";
import type { ExecutionContext } from "./types";
import { createNotifyTool } from "./notify";
import { JiePlatformError } from "../domain-types";

type NotifyEnvelope = EventEnvelope<`custom.${string}`>;

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
  events.subscribe("custom.t1.task", (env) => {
    received.push({ subject: env.topic, env });
  });
  return { events, received };
}

describe("notify — topic validation", () => {
  test("rejects empty topic with notify_invalid_topic: empty", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    let caught: unknown;
    try {
      await tool.execute({ topic: "", prompt: "x" }, makeCtx());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe("notify_invalid_topic: empty");
  });

  test("rejects topic starting with `agent.`", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    let caught: unknown;
    try {
      await tool.execute({ topic: "agent.idle", prompt: "x" }, makeCtx());
    } catch (error) {
      caught = error;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: starts_with_agent_prefix",
    );
  });

  test("rejects topic starting with the body's team_id", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    const ctx = makeCtx();
    let caught: unknown;
    try {
      await tool.execute({ topic: `${ctx.teamId}.task`, prompt: "x" }, ctx);
    } catch (error) {
      caught = error;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: starts_with_team_prefix",
    );
  });

  test("rejects topic containing a null byte", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    let caught: unknown;
    try {
      await tool.execute({ topic: "bad\0topic", prompt: "x" }, makeCtx());
    } catch (error) {
      caught = error;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: contains_null_byte",
    );
  });
});

describe("notify — valid publish path", () => {
  test("publishes a full envelope to custom.{team_id}.{topic}", async () => {
    const { events, received } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });

    const ctx = makeCtx();
    const before = Date.now();
    await tool.execute({ topic: "task", prompt: "hello" }, ctx);
    const after = Date.now();

    expect(received).toHaveLength(1);
    const { subject, env } = received[0]!;
    expect(subject).toBe("custom.t1.task");
    expect(env.version).toBe(1);
    expect(env.topic).toBe("custom.t1.task");
    expect(env.sender.kind).toBe("agent");
    if (env.sender.kind === "agent") {
      expect(env.sender.identity.teamId).toBe("t1");
      expect(env.sender.identity.agentRole).toBe("leader");
      expect(env.sender.identity.agentKey).toBe("leader-1");
    }
    expect(env.payload).toEqual("hello");
    const ts = new Date(env.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test("LLM-facing content reflects the published topic", async () => {
    const events = createEventManager();
    events.subscribe("custom.t1.task", () => {});
    const tool = createNotifyTool({ eventManager: events });

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe("Notification published on 'task'");
    expect(result.terminate).toBeUndefined();
  });

  test("LLM-facing content is identical whether peers are listening or not", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    const result = await tool.execute(
      { topic: "ghost", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe("Notification published on 'ghost'");
  });

  test("`details = { topic }` is returned for afterToolCall hooks", async () => {
    const events = createEventManager();
    events.subscribe("custom.t1.task", () => {});
    const tool = createNotifyTool({ eventManager: events });

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task" });
  });

  test("does not end the LLM turn (terminate not set)", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.terminate).toBeUndefined();
  });

  test("tool metadata: name, description, label, parameters", () => {
    const events = createEventManager();
    const tool = createNotifyTool({ eventManager: events });
    expect(tool.name).toBe("notify");
    expect(tool.label).toBe("Notify");
    expect(tool.description).toContain("Publish a message");
    expect(tool.description).toContain("topic");
    expect(tool.description).toContain("prompt");
  });
});
