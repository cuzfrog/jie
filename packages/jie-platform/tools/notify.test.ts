import {
  type EventEnvelope,
  type EventManager,
  type EventType,
} from "../event";
import type { ArtifactStore } from "../storage";
import { JiePlatformError } from "../jie-platform-errors";
import type { TaskLifecycle } from "../types";
import type { ExecutionContext } from "./types";
import type { TaskLifecycleGuard } from "./task-lifecycle";
import { createNotifyTool } from "./notify";

type NotifyEnvelope = EventEnvelope<`custom.${string}`>;

const taskLifecycleGuard = vi.mocked<TaskLifecycleGuard>({
  applyTransition: vi.fn(),
});

beforeEach(() => {
  taskLifecycleGuard.applyTransition.mockResolvedValue({ phase: "recorded", iteration: 1 });
});

function makeCtx(): ExecutionContext {
  return {
    sessionId: "sess-1",
    teamId: "t1",
    agentKey: "leader-1",
    agentRole: "leader",
    artifactStore: stubArtifactStore(),
    lifecycle: null,
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

function makeFakeEventManager(): EventManager {
  const subscribers = new Map<string, Array<(env: EventEnvelope<EventType>) => void>>();
  return {
    publish: (env: EventEnvelope<EventType>) => {
      for (const callback of subscribers.get(env.topic) ?? []) callback(env);
    },
    subscribe: (topic: string, callback: (env: EventEnvelope<EventType>) => void) => {
      const list = subscribers.get(topic) ?? [];
      list.push(callback);
      subscribers.set(topic, list);
      return () => {
        subscribers.set(topic, list.filter((cb) => cb !== callback));
      };
    },
  };
}

interface Harness {
  events: EventManager;
  received: Array<{ subject: string; env: NotifyEnvelope }>;
}

function makeHarness(): Harness {
  const events = makeFakeEventManager();
  const received: Array<{ subject: string; env: NotifyEnvelope }> = [];
  events.subscribe("custom.t1.task", (env) => {
    received.push({ subject: env.topic, env });
  });
  return { events, received };
}

describe("notify — topic validation", () => {
  test("rejects empty topic with notify_invalid_topic: empty", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(tool.execute({ topic: "", prompt: "x" }, makeCtx())).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: empty",
    });
  });

  test("rejects topic starting with `agent.`", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "agent.idle", prompt: "x" }, makeCtx()),
    ).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: starts_with_agent_prefix",
    });
  });

  test("rejects topic starting with the body's team_id", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
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
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "bad\0topic", prompt: "x" }, makeCtx()),
    ).rejects.toMatchObject({
      code: "NOTIFY_INVALID_TOPIC",
      message: "Invalid topic for notify: contains_null_byte",
    });
  });

  test("rejects prompt longer than EVENT_TEXT_TRUNCATION_BYTES", async () => {
    const { events, received } = makeHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
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
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    const at = "x".repeat(4096);
    await tool.execute({ topic: "task", prompt: at }, makeCtx());
    expect(received).toHaveLength(1);
  });
});

describe("notify — valid publish path", () => {
  test("publishes a full envelope to custom.{team_id}.{topic}", async () => {
    const { events, received } = makeHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });

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
      expect(env.sender.teamId).toBe("t1");
      expect(env.sender.agentKey).toBe("leader-1");
    }
    expect(env.payload).toEqual({ message: "hello", truncated: false });
    const ts = new Date(env.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  test("LLM-facing content is identical whether peers are listening or not; never terminates", async () => {
    const result = await createNotifyTool({ eventManager: makeFakeEventManager(), taskLifecycleGuard }).execute(
      { topic: "ghost", prompt: "x" },
      makeCtx(),
    );
    expect(result.content).toBe("Notification published on 'ghost'");
    expect(result.terminate).toBeUndefined();
  });

  test("`details = { topic }` is returned for afterToolCall hooks", async () => {
    const events = makeFakeEventManager();
    events.subscribe("custom.t1.task", () => {});
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });

    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.details).toEqual({ topic: "task" });
  });

  test("does not end the LLM turn (terminate not set)", async () => {
    const { events } = makeHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    const result = await tool.execute(
      { topic: "task", prompt: "x" },
      makeCtx(),
    );
    expect(result.terminate).toBeUndefined();
  });

  test("tool metadata: name, description, label, parameters", () => {
    const events = makeFakeEventManager();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    expect(tool.name).toBe("notify");
    expect(tool.label).toBe("Notify");
    expect(tool.description).toContain("Publish a message");
    expect(tool.description).toContain("topic");
    expect(tool.description).toContain("prompt");
  });
});

const lifecycle: TaskLifecycle = {
  maxIterations: 5,
  permanentPhases: [],
  transitions: [
    { topic: "task.recorded", role: "dm", fromPhases: "any", toPhase: "recorded", iteration: "reset" },
  ],
  writeGates: [],
};

function makeLifecycleCtx(): ExecutionContext {
  return { ...makeCtx(), agentRole: "dm", lifecycle };
}

function makeLifecycleHarness(): { events: EventManager; received: Array<EventEnvelope<EventType>> } {
  const events = makeFakeEventManager();
  const received: Array<EventEnvelope<EventType>> = [];
  events.subscribe("custom.t1.task.recorded", (env) => {
    received.push(env);
  });
  return { events, received };
}

describe("notify — lifecycle enforcement", () => {
  test("requires task_id on a lifecycle topic", async () => {
    const { events, received } = makeLifecycleHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(tool.execute({ topic: "task.recorded", prompt: "x" }, makeLifecycleCtx())).rejects.toMatchObject({
      code: "MISSING_REQUIRED_FIELD",
      message: "Required field missing: task_id is required for lifecycle topic 'task.recorded'",
    });
    expect(taskLifecycleGuard.applyTransition).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  test("rejects a task_id outside [A-Za-z0-9_.-]{1,128}", async () => {
    const { events, received } = makeLifecycleHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "task.recorded", prompt: "x", task_id: "bad/id" }, makeLifecycleCtx()),
    ).rejects.toMatchObject({ code: "INVALID_TASK_ID", message: "Invalid task_id: bad/id" });
    expect(taskLifecycleGuard.applyTransition).not.toHaveBeenCalled();
    expect(received).toHaveLength(0);
  });

  test("applies the guarded transition before publishing and reports phase and iteration", async () => {
    const { events, received } = makeLifecycleHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    const result = await tool.execute(
      { topic: "task.recorded", prompt: "new task", task_id: "T-1" },
      makeLifecycleCtx(),
    );
    expect(taskLifecycleGuard.applyTransition).toHaveBeenCalledWith({
      lifecycle,
      taskId: "T-1",
      topic: "task.recorded",
      agentRole: "dm",
    });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ message: "new task", truncated: false });
    expect(result.content).toBe("Notification published on 'task.recorded' (task 'T-1' moved to phase 'recorded', iteration 1)");
    expect(result.details).toEqual({ topic: "task.recorded", task_id: "T-1", phase: "recorded", iteration: 1 });
  });

  test("a denied transition publishes nothing and surfaces the guard error", async () => {
    const { events, received } = makeLifecycleHarness();
    taskLifecycleGuard.applyTransition.mockRejectedValueOnce(
      new JiePlatformError("ILLEGAL_TRANSITION", { detail: "task 'T-1' is in permanent phase 'done'" }),
    );
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "task.recorded", prompt: "x", task_id: "T-1" }, makeLifecycleCtx()),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    expect(received).toHaveLength(0);
  });

  test("rejects task_id on a non-lifecycle topic of a lifecycle team", async () => {
    const events = makeFakeEventManager();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "chit-chat", prompt: "x", task_id: "T-1" }, makeLifecycleCtx()),
    ).rejects.toMatchObject({
      code: "INVALID_TASK_ID",
      message: "Invalid task_id: task_id is not accepted on non-lifecycle topic 'chit-chat'",
    });
    expect(taskLifecycleGuard.applyTransition).not.toHaveBeenCalled();
  });

  test("rejects task_id when the team declares no lifecycle", async () => {
    const events = makeFakeEventManager();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "task", prompt: "x", task_id: "T-1" }, makeCtx()),
    ).rejects.toMatchObject({ code: "INVALID_TASK_ID" });
    expect(taskLifecycleGuard.applyTransition).not.toHaveBeenCalled();
  });

  test("an empty task_id counts as missing on a lifecycle topic", async () => {
    const { events, received } = makeLifecycleHarness();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    await expect(
      tool.execute({ topic: "task.recorded", prompt: "x", task_id: "" }, makeLifecycleCtx()),
    ).rejects.toMatchObject({ code: "MISSING_REQUIRED_FIELD" });
    expect(received).toHaveLength(0);
  });

  test("an empty task_id is ignored on a non-lifecycle topic", async () => {
    const events = makeFakeEventManager();
    const tool = createNotifyTool({ eventManager: events, taskLifecycleGuard });
    const result = await tool.execute({ topic: "chit-chat", prompt: "hi", task_id: "" }, makeLifecycleCtx());
    expect(result.content).toBe("Notification published on 'chit-chat'");
    expect(taskLifecycleGuard.applyTransition).not.toHaveBeenCalled();
  });
});
