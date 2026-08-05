import type { ArtifactStore } from "../storage";
import type { TaskLifecycle, TaskTransitionRule } from "../types";
import { createTaskLifecycleGuard } from "./task-lifecycle";

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const lifecycle: TaskLifecycle = {
  maxIterations: 2,
  permanentPhases: ["done"],
  transitions: [
    { topic: "task.recorded", role: "dm", fromPhases: "any", toPhase: "recorded", iteration: "reset" },
    { topic: "task.designed", role: "architect", fromPhases: ["researched"], toPhase: "designed", iteration: null },
    { topic: "task.planned", role: "planner", fromPhases: ["designed"], toPhase: "planned", iteration: null },
    { topic: "task.planned", role: "planner", fromPhases: ["review_failed"], toPhase: "planned", iteration: "increment" },
    { topic: "task.done", role: "dm", fromPhases: ["review_passed"], toPhase: "done", iteration: null },
    { topic: "task.failed", role: "any", fromPhases: "any", toPhase: "failed", iteration: null },
  ],
  writeGates: [],
};

function transition(overrides: Partial<TaskTransitionRule>): TaskTransitionRule {
  return { topic: "task.x", role: "dm", fromPhases: "any", toPhase: "x", iteration: null, ...overrides };
}

function row(key: string, created_at: string): { key: string; created_at: string } {
  return { key, created_at };
}

function statusContent(phase: string, iteration: number): string {
  return JSON.stringify({ phase, iteration, updated_at: "2026-01-01T00:00:00.000Z" });
}

function setCurrent(key: string, phase: string, iteration: number): void {
  artifactStore.list.mockResolvedValue([row(key, "2026-01-01T00:00:01.000Z")]);
  artifactStore.read.mockResolvedValue({ key, content: statusContent(phase, iteration), created_at: "2026-01-01T00:00:01.000Z" });
}

describe("createTaskLifecycleGuard", () => {
  beforeEach(() => {
    artifactStore.list.mockResolvedValue([]);
    artifactStore.read.mockResolvedValue(null);
    artifactStore.write.mockResolvedValue({ key: "", created_at: "" });
  });

  test("allows a matching transition, writes the first status row, and returns the new state", async () => {
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(outcome).toEqual({ phase: "recorded", iteration: 1 });
    expect(artifactStore.write).toHaveBeenCalledTimes(1);
    const [key, content] = artifactStore.write.mock.calls[0]!;
    expect(key).toBe("T-1/status/0001");
    const parsed = JSON.parse(content) as { phase: string; iteration: number; updated_at: string };
    expect(parsed.phase).toBe("recorded");
    expect(parsed.iteration).toBe(1);
    expect(typeof parsed.updated_at).toBe("string");
  });

  test("reads the newest status row and preserves iteration on a flag-less transition", async () => {
    artifactStore.list.mockResolvedValue([
      row("T-1/status/0001", "2026-01-01T00:00:01.000Z"),
      row("T-1/status/0002", "2026-01-01T00:00:02.000Z"),
    ]);
    artifactStore.read.mockResolvedValue({
      key: "T-1/status/0002",
      content: statusContent("designed", 1),
      created_at: "2026-01-01T00:00:02.000Z",
    });
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.planned", agentRole: "planner" });
    expect(outcome).toEqual({ phase: "planned", iteration: 1 });
    expect(artifactStore.read).toHaveBeenCalledWith("T-1/status/0002");
    expect(artifactStore.write.mock.calls[0]![0]).toBe("T-1/status/0003");
  });

  test("ties on created_at fall back to the highest seq key", async () => {
    const sameInstant = "2026-01-01T00:00:05.000Z";
    artifactStore.list.mockResolvedValue([row("T-1/status/0002", sameInstant), row("T-1/status/0001", sameInstant)]);
    artifactStore.read.mockResolvedValue({ key: "T-1/status/0002", content: statusContent("designed", 1), created_at: sameInstant });
    const guard = createTaskLifecycleGuard(artifactStore);
    await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.planned", agentRole: "planner" });
    expect(artifactStore.read).toHaveBeenCalledWith("T-1/status/0002");
  });

  test("denies when no rule on the topic allows the caller role", async () => {
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "planner" }),
    ).rejects.toThrow(expect.objectContaining({ code: "ILLEGAL_TRANSITION" }));
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("denies when the current phase is not in the rule's from list", async () => {
    setCurrent("T-1/status/0001", "recorded", 1);
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.planned", agentRole: "planner" }),
    ).rejects.toThrow("is in phase 'recorded', but topic 'task.planned' requires one of: designed, review_failed");
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("denies an explicit-from transition when the task has no phase yet", async () => {
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.planned", agentRole: "planner" }),
    ).rejects.toThrow("has no phase yet; topic 'task.planned' requires one of: designed, review_failed");
  });

  test("re-recording a task resets the iteration to 1", async () => {
    setCurrent("T-1/status/0001", "planned", 2);
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(outcome).toEqual({ phase: "recorded", iteration: 1 });
  });

  test("a permanent phase blocks every outgoing transition", async () => {
    setCurrent("T-1/status/0001", "done", 1);
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" }),
    ).rejects.toThrow("is in permanent phase 'done'");
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.failed", agentRole: "reviewer" }),
    ).rejects.toThrow("is in permanent phase 'done'");
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("increment raises the iteration by one", async () => {
    setCurrent("T-1/status/0001", "review_failed", 1);
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.planned", agentRole: "planner" });
    expect(outcome).toEqual({ phase: "planned", iteration: 2 });
  });

  test("increment is denied when it would exceed max_iterations", async () => {
    setCurrent("T-1/status/0001", "review_failed", 2);
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.planned", agentRole: "planner" }),
    ).rejects.toThrow("iteration 3 would exceed max_iterations 2");
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("a role:any rule applies to roles without an exact rule", async () => {
    setCurrent("T-1/status/0001", "implemented", 1);
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.failed", agentRole: "implementer" });
    expect(outcome).toEqual({ phase: "failed", iteration: 1 });
  });

  test("an exact-role rule wins over the role:any wildcard", async () => {
    const custom: TaskLifecycle = {
      maxIterations: 5,
      permanentPhases: [],
      transitions: [
        transition({ topic: "task.x", role: "dm", toPhase: "specific" }),
        transition({ topic: "task.x", role: "any", toPhase: "generic" }),
      ],
      writeGates: [],
    };
    const guard = createTaskLifecycleGuard(artifactStore);
    const dmOutcome = await guard.applyTransition({ lifecycle: custom, taskId: "T-1", topic: "task.x", agentRole: "dm" });
    expect(dmOutcome.phase).toBe("specific");
    const otherOutcome = await guard.applyTransition({ lifecycle: custom, taskId: "T-1", topic: "task.x", agentRole: "researcher" });
    expect(otherOutcome.phase).toBe("generic");
  });

  test("exact-role rules shadow the wildcard even when their from-phases do not match", async () => {
    const custom: TaskLifecycle = {
      maxIterations: 5,
      permanentPhases: [],
      transitions: [
        transition({ topic: "task.x", role: "dm", fromPhases: ["somewhere"], toPhase: "specific" }),
        transition({ topic: "task.x", role: "any", toPhase: "generic" }),
      ],
      writeGates: [],
    };
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle: custom, taskId: "T-1", topic: "task.x", agentRole: "dm" }),
    ).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("a malformed status row is treated as absent", async () => {
    artifactStore.list.mockResolvedValue([row("T-1/status/0001", "2026-01-01T00:00:01.000Z")]);
    artifactStore.read.mockResolvedValue({ key: "T-1/status/0001", content: "not json", created_at: "2026-01-01T00:00:01.000Z" });
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(outcome).toEqual({ phase: "recorded", iteration: 1 });
  });

  test("a status row with wrongly typed fields is treated as absent", async () => {
    artifactStore.list.mockResolvedValue([row("T-1/status/0001", "2026-01-01T00:00:01.000Z")]);
    artifactStore.read.mockResolvedValue({
      key: "T-1/status/0001",
      content: JSON.stringify({ phase: 3, iteration: "x" }),
      created_at: "2026-01-01T00:00:01.000Z",
    });
    const guard = createTaskLifecycleGuard(artifactStore);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(outcome).toEqual({ phase: "recorded", iteration: 1 });
  });

  test("seq numbering continues from the existing row count", async () => {
    artifactStore.list.mockResolvedValue([
      row("T-1/status/0001", "2026-01-01T00:00:01.000Z"),
      row("T-1/status/0002", "2026-01-01T00:00:02.000Z"),
      row("T-1/status/0003", "2026-01-01T00:00:03.000Z"),
    ]);
    artifactStore.read.mockResolvedValue({
      key: "T-1/status/0003",
      content: statusContent("planned", 2),
      created_at: "2026-01-01T00:00:03.000Z",
    });
    const guard = createTaskLifecycleGuard(artifactStore);
    await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(artifactStore.write.mock.calls[0]![0]).toBe("T-1/status/0004");
  });

  test("concurrent transitions on the same task serialize: the second waits for the first's write", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let firstWrite!: () => void;
    const firstWriteReached = new Promise<void>((resolve) => { firstWrite = resolve; });
    artifactStore.list
      .mockResolvedValueOnce([])
      .mockResolvedValue([row("T-1/status/0001", "2026-01-01T00:00:01.000Z")]);
    artifactStore.read.mockResolvedValue({
      key: "T-1/status/0001",
      content: statusContent("recorded", 1),
      created_at: "2026-01-01T00:00:01.000Z",
    });
    artifactStore.write.mockImplementationOnce(async () => {
      firstWrite();
      await gate;
      return { key: "T-1/status/0001", created_at: "2026-01-01T00:00:01.000Z" };
    });
    const guard = createTaskLifecycleGuard(artifactStore);
    const first = guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    await firstWriteReached;
    const second = guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(artifactStore.list).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(artifactStore.list).toHaveBeenCalledTimes(2);
    expect(artifactStore.write.mock.calls.map((call) => call[0])).toEqual(["T-1/status/0001", "T-1/status/0002"]);
  });

  test("a failed transition releases the lock for later transitions on the same task", async () => {
    artifactStore.list.mockRejectedValueOnce(new Error("store down"));
    const guard = createTaskLifecycleGuard(artifactStore);
    await expect(
      guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" }),
    ).rejects.toThrow("store down");
    artifactStore.list.mockResolvedValue([]);
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    expect(outcome).toEqual({ phase: "recorded", iteration: 1 });
    expect(artifactStore.write).toHaveBeenCalledTimes(1);
  });

  test("transitions on different tasks run concurrently", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let firstWrite!: () => void;
    const firstWriteReached = new Promise<void>((resolve) => { firstWrite = resolve; });
    artifactStore.write.mockImplementationOnce(async () => {
      firstWrite();
      await gate;
      return { key: "T-1/status/0001", created_at: "2026-01-01T00:00:01.000Z" };
    });
    const guard = createTaskLifecycleGuard(artifactStore);
    const first = guard.applyTransition({ lifecycle, taskId: "T-1", topic: "task.recorded", agentRole: "dm" });
    await firstWriteReached;
    const outcome = await guard.applyTransition({ lifecycle, taskId: "T-2", topic: "task.recorded", agentRole: "dm" });
    expect(outcome).toEqual({ phase: "recorded", iteration: 1 });
    expect(artifactStore.list).toHaveBeenCalledTimes(2);
    release();
    await first;
  });
});
