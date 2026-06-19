import { describe, expect, test } from "bun:test";
import { InMemoryArtifactStore } from "../storage/artifact-store.ts";
import { createEventBus, type EventBus } from "../core/event-bus.ts";
import type { AgentEvent } from "../core/agent-event.ts";
import type { ExecutionContext } from "./types.ts";
import { createNotifyTool } from "./notify.ts";
import { JiePlatformError } from "../domain-types.ts";

function makeCtx(): ExecutionContext {
  return {
    session_id: "sess-1",
    team_id: "t1",
    agent_key: "leader-1",
    agent_role: "leader",
    artifacts: new InMemoryArtifactStore(),
  };
}

describe("notify — topic validation", () => {
  test("rejects empty topic with notify_invalid_topic: empty", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
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
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
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
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    const ctx = makeCtx();
    let caught: unknown;
    try {
      await tool.execute({ topic: `${ctx.team_id}.task`, prompt: "x" }, ctx);
    } catch (e) {
      caught = e;
    }
    expect((caught as JiePlatformError).code).toBe("notify_invalid_topic");
    expect((caught as Error).message).toBe(
      "notify_invalid_topic: starts_with_team_prefix",
    );
  });

  test("rejects topic containing a null byte", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
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
  test("publishes a full AgentEvent envelope to {team_id}.{topic}", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    let received: AgentEvent | undefined;
    let receivedSubject: string | undefined;
    bus.subscribe("t1.task", (subject, payload) => {
      receivedSubject = subject;
      received = payload as AgentEvent;
    });

    const ctx = makeCtx();
    const before = Date.now();
    await tool.execute({ topic: "task", prompt: "hello" }, ctx);
    const after = Date.now();

    expect(receivedSubject).toBe("t1.task");
    expect(received).toBeDefined();
    expect(received!.version).toBe(1);
    expect(received!.team_id).toBe("t1");
    expect(received!.event_type).toBe("task");
    expect(received!.agent_role).toBe("leader");
    expect(received!.agent_key).toBe("leader-1");
    expect(received!.payload).toEqual({ prompt: "hello", source: "leader-1" });
    const ts = new Date(received!.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test("LLM-facing content is the > 0 variant when there are recipients", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    bus.subscribe("t1.task", () => {});
    bus.subscribe("t1.task", () => {});

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe("Notification delivered to 2 recipients");
    expect(result.terminate).toBeUndefined();
  });

  test("LLM-facing content is the 0 variant when no peer is listening", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    const result = await tool.execute(
      { topic: "ghost", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe(
      "Notification delivered to 0 recipients — no agent is subscribed to 'ghost'",
    );
  });

  test("`details = { topic, recipients }` is returned for afterToolCall hooks", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    bus.subscribe("t1.task", () => {});

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task", recipients: 1 });
  });

  test("recipients count subtracts 1 when the publisher is itself subscribed", async () => {
    const bus = createEventBus();
    bus.subscribe("t1.task", () => {});
    const tool = createNotifyTool({
      bus,
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
    const bus = createEventBus();
    bus.subscribe("t1.task", () => {});
    const tool = createNotifyTool({
      bus,
      isSelfSubscribed: () => true,
    });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task", recipients: 0 });
  });

  test("does not end the LLM turn (terminate not set)", async () => {
    const bus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.terminate).toBeUndefined();
  });

  test("tool metadata: name, description, label, parameters", () => {
    const bus: EventBus = createEventBus();
    const tool = createNotifyTool({ bus, isSelfSubscribed: () => false });
    expect(tool.name).toBe("notify");
    expect(tool.label).toBe("Notify");
    expect(tool.description).toContain("Publish a message");
    expect(tool.description).toContain("topic");
    expect(tool.description).toContain("prompt");
  });
});