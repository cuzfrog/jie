import {
  createEventManager,
  type EventEnvelope,
  type EventManager,
} from "../event";
import type { ArtifactStore } from "../storage";
import type { ExecutionContext } from "./types";
import { createNotifyTool } from "./notify";

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
    await expect(tool.execute({ topic: "", prompt: "x" }, makeCtx())).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: empty",
    });
  });

  test("rejects topic starting with `agent.`", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    await expect(
      tool.execute({ topic: "agent.idle", prompt: "x" }, makeCtx()),
    ).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: starts_with_agent_prefix",
    });
  });

  test("rejects topic starting with the body's team_id", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    const ctx = makeCtx();
    await expect(
      tool.execute({ topic: `${ctx.teamId}.task`, prompt: "x" }, ctx),
    ).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: starts_with_team_prefix",
    });
  });

  test("rejects topic containing a null byte", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    await expect(
      tool.execute({ topic: "bad\0topic", prompt: "x" }, makeCtx()),
    ).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: contains_null_byte",
    });
  });

  test("rejects prompt longer than EVENT_TEXT_TRUNCATION_BYTES", async () => {
    const { events, received } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    const oversized = "x".repeat(4097);
    await expect(
      tool.execute({ topic: "task", prompt: oversized }, makeCtx()),
    ).rejects.toMatchObject({
      code: "NOTIFY_PROMPT_TOO_LONG",
      message: "Notify prompt exceeds the maximum allowed size: prompt length 4097 exceeds max 4096",
    });
    expect(received).toHaveLength(0);
  });

  test("accepts prompt exactly at EVENT_TEXT_TRUNCATION_BYTES", async () => {
    const { events, received } = makeHarness();
    const tool = createNotifyTool({ eventManager: events });
    const at = "x".repeat(4096);
    await tool.execute({ topic: "task", prompt: at }, makeCtx());
    expect(received).toHaveLength(1);
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
    expect(env.payload).toEqual({ message: "hello", truncated: false });
    const ts = new Date(env.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test("LLM-facing content is identical whether peers are listening or not; never terminates", async () => {
    const result = await createNotifyTool({ eventManager: createEventManager() }).execute(
      { topic: "ghost", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe("Notification published on 'ghost'");
    expect(result.terminate).toBeUndefined();
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
