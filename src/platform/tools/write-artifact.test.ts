import { createWriteArtifactTool } from "./write-artifact";
import type { ArtifactStore } from "../storage";
import type { TaskLifecycle } from "../types";
import type { ExecutionContext } from "./types";
import { makeEmptyContext } from "./_test-context";

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const lifecycle: TaskLifecycle = {
  maxIterations: 5,
  permanentPhases: [],
  transitions: [],
  writeGates: [],
};

function makeLifecycleContext(): ExecutionContext {
  return { ...makeEmptyContext(), lifecycle };
}

describe("write_artifact", () => {
  test("success: content reports key + char count; details carries key + created_at", async () => {
    artifactStore.write.mockResolvedValue({ key: "task/plan", created_at: "2026-07-23T00:00:00.000Z" });
    const tool = createWriteArtifactTool({ artifactStore });
    const result = await tool.execute(
      { key: "task/plan", content: "hello" },
      makeEmptyContext(),
    );
    expect(artifactStore.write).toHaveBeenCalledWith("task/plan", "hello");
    expect(result.content).toBe("Stored artifact at task/plan (5 chars)");
    expect(result.details).toEqual({
      key: "task/plan",
      created_at: "2026-07-23T00:00:00.000Z",
    });
  });

  test("rejects a status-row key with ARTIFACT_KEY_RESERVED when the team declares a lifecycle", async () => {
    const tool = createWriteArtifactTool({ artifactStore });
    await expect(tool.execute({ key: "task1/status/0001", content: "{}" }, makeLifecycleContext())).rejects.toMatchObject({
      code: "ARTIFACT_KEY_RESERVED",
    });
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("rejects any key inside a /status/ namespace when the team declares a lifecycle", async () => {
    const tool = createWriteArtifactTool({ artifactStore });
    await expect(tool.execute({ key: "a/b/status/c", content: "{}" }, makeLifecycleContext())).rejects.toMatchObject({
      code: "ARTIFACT_KEY_RESERVED",
    });
    expect(artifactStore.write).not.toHaveBeenCalled();
  });

  test("allows a status-row key when no lifecycle is declared", async () => {
    artifactStore.write.mockResolvedValue({ key: "task1/status/0001", created_at: "2026-07-23T00:00:00.000Z" });
    const tool = createWriteArtifactTool({ artifactStore });
    await tool.execute({ key: "task1/status/0001", content: "{}" }, makeEmptyContext());
    expect(artifactStore.write).toHaveBeenCalledWith("task1/status/0001", "{}");
  });

  test("allows keys adjacent to the reserved namespace when the team declares a lifecycle", async () => {
    artifactStore.write.mockResolvedValue({ key: "task1/status_report", created_at: "2026-07-23T00:00:00.000Z" });
    const tool = createWriteArtifactTool({ artifactStore });
    await tool.execute({ key: "task1/status_report", content: "{}" }, makeLifecycleContext());
    expect(artifactStore.write).toHaveBeenCalledWith("task1/status_report", "{}");
  });
});
