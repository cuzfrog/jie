import type { ArtifactStore } from "../storage";
import { createArtifactTool } from "./artifact";
import { makeEmptyContext } from "./_test-context";

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

function contextWithToolArgs(args: ReadonlyArray<string>) {
  const context = makeEmptyContext();
  return { ...context, toolArgs: new Map([["artifact", args]]) };
}

describe("artifact", () => {
  test("read hit: content is the artifact's content; details carries key+content+created_at", async () => {
    artifactStore.read.mockResolvedValue({ key: "k", content: "body", created_at: "2026-07-23T00:00:00.000Z" });
    const tool = createArtifactTool({ artifactStore });
    const result = await tool.execute({ op: "read", key: "k" }, makeEmptyContext());
    expect(artifactStore.read).toHaveBeenCalledWith("k");
    expect(result.content).toBe("body");
    expect(result.details).toEqual({ key: "k", content: "body", created_at: "2026-07-23T00:00:00.000Z" });
  });

  test("read miss: content is 'Artifact not found: <key>'; details is null", async () => {
    artifactStore.read.mockResolvedValue(null);
    const tool = createArtifactTool({ artifactStore });
    const result = await tool.execute({ op: "read", key: "missing" }, makeEmptyContext());
    expect(result.content).toBe("Artifact not found: missing");
    expect(result.details).toBeNull();
  });

  test("read without key throws INVALID_TOOL_ARGS", async () => {
    const tool = createArtifactTool({ artifactStore });
    await expect(tool.execute({ op: "read" }, makeEmptyContext())).rejects.toMatchObject({ code: "INVALID_TOOL_ARGS" });
  });

  test("write: content reports key + char count; details carries key + created_at", async () => {
    artifactStore.write.mockResolvedValue({ key: "task/plan", created_at: "2026-07-23T00:00:00.000Z" });
    const tool = createArtifactTool({ artifactStore });
    const result = await tool.execute({ op: "write", key: "task/plan", content: "hello" }, makeEmptyContext());
    expect(artifactStore.write).toHaveBeenCalledWith("task/plan", "hello");
    expect(result.content).toBe("Stored artifact at task/plan (5 chars)");
    expect(result.details).toEqual({ key: "task/plan", created_at: "2026-07-23T00:00:00.000Z" });
  });

  test("write without key or content throws INVALID_TOOL_ARGS", async () => {
    const tool = createArtifactTool({ artifactStore });
    await expect(tool.execute({ op: "write", key: "k" }, makeEmptyContext())).rejects.toMatchObject({ code: "INVALID_TOOL_ARGS" });
    await expect(tool.execute({ op: "write", content: "c" }, makeEmptyContext())).rejects.toMatchObject({ code: "INVALID_TOOL_ARGS" });
  });

  test("list: default pattern returns all artifacts; details carries matches", async () => {
    const items = [
      { key: "tasks/abc/plan", created_at: "2026-08-08T10:30:00Z" },
      { key: "tasks/xyz/plan", created_at: "2026-08-08T09:00:00Z" },
    ];
    artifactStore.list.mockResolvedValue(items);
    const tool = createArtifactTool({ artifactStore });
    const result = await tool.execute({ op: "list" }, makeEmptyContext());
    expect(result.content).toBe("tasks/abc/plan  (2026-08-08T10:30:00Z)\ntasks/xyz/plan  (2026-08-08T09:00:00Z)\n[2 artifacts]");
    expect(result.details).toEqual({ kind: "artifact-list", matches: items, total: 2, truncated: false });
  });

  test("list filters by glob pattern and reports misses", async () => {
    artifactStore.list.mockResolvedValue([{ key: "tasks/abc/plan", created_at: "2026-08-08T10:30:00Z" }]);
    const tool = createArtifactTool({ artifactStore });
    const result = await tool.execute({ op: "list", pattern: "nonexistent/*" }, makeEmptyContext());
    expect(result.content).toBe("No artifacts matching: nonexistent/*");
    expect(result.details).toEqual({ kind: "artifact-list", matches: [], total: 0, truncated: false });
  });

  test("list clamps limit between 1 and 200 and reports truncation", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({ key: `k${i}`, created_at: "2026-08-08T00:00:00Z" }));
    artifactStore.list.mockResolvedValue(many);
    const tool = createArtifactTool({ artifactStore });
    const result = await tool.execute({ op: "list", limit: 1000 }, makeEmptyContext());
    expect(result.content).toContain("[showing 200 of 250 artifacts - refine your pattern]");
    expect(result.details).toMatchObject({ kind: "artifact-list", total: 250, truncated: true });
  });

  test("ops outside the manifest allowlist are rejected with TOOL_OP_DENIED", async () => {
    artifactStore.write.mockResolvedValue({ key: "k", created_at: "" });
    artifactStore.read.mockResolvedValue(null);
    const tool = createArtifactTool({ artifactStore });
    await expect(tool.execute({ op: "write", key: "k", content: "c" }, contextWithToolArgs(["read"]))).rejects.toMatchObject({ code: "TOOL_OP_DENIED" });
    await expect(tool.execute({ op: "read", key: "k" }, contextWithToolArgs(["read"]))).resolves.toBeDefined();
  });

  test("no toolArgs allowlist permits all ops", async () => {
    artifactStore.read.mockResolvedValue(null);
    const tool = createArtifactTool({ artifactStore });
    await expect(tool.execute({ op: "read", key: "k" }, makeEmptyContext())).resolves.toBeDefined();
  });
});
