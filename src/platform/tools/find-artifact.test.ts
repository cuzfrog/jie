import type { ArtifactStore } from "../storage";
import { createFindArtifactTool } from "./find-artifact";
import { makeEmptyContext } from "./_test-context";

function storeWith(
  items: ReadonlyArray<{ readonly key: string; readonly created_at: string }>,
): ArtifactStore {
  return {
    write: async () => ({ key: "", created_at: "" }),
    read: async () => null,
    list: async () => [...items],
  };
}

const ITEMS = [
  { key: "tasks/abc/plan", created_at: "2026-08-08T10:30:00Z" },
  { key: "tasks/abc/research", created_at: "2026-08-08T10:25:00Z" },
  { key: "tasks/xyz/plan", created_at: "2026-08-08T09:00:00Z" },
] as const;

describe("find_artifact", () => {
  test("default pattern returns all artifacts newest first", async () => {
    const tool = createFindArtifactTool({ artifactStore: storeWith(ITEMS) });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.content).toBe(
      "tasks/abc/plan  (2026-08-08T10:30:00Z)\n" +
        "tasks/abc/research  (2026-08-08T10:25:00Z)\n" +
        "tasks/xyz/plan  (2026-08-08T09:00:00Z)\n" +
        "[3 artifacts]",
    );
    expect(result.details).toEqual({
      kind: "artifact-list",
      matches: [...ITEMS],
      total: 3,
      truncated: false,
    });
  });

  test("filters by glob pattern", async () => {
    const tool = createFindArtifactTool({ artifactStore: storeWith(ITEMS) });
    const result = await tool.execute({ pattern: "tasks/*/plan" }, makeEmptyContext());
    expect(result.content).toContain("tasks/abc/plan");
    expect(result.content).toContain("tasks/xyz/plan");
    expect(result.content).not.toContain("research");
    expect(result.content).toContain("[2 artifacts]");
  });

  test("caps at the default limit of 50", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      key: `k${i}`,
      created_at: "2026-08-08T00:00:00Z",
    }));
    const tool = createFindArtifactTool({ artifactStore: storeWith(many) });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.details).toMatchObject({ kind: "artifact-list", total: 60, truncated: true });
    expect(result.content).toContain("[showing 50 of 60 artifacts - refine your pattern]");
  });

  test("honors a custom limit", async () => {
    const tool = createFindArtifactTool({ artifactStore: storeWith(ITEMS) });
    const result = await tool.execute({ limit: 2 }, makeEmptyContext());
    expect(result.content).toContain("[showing 2 of 3 artifacts - refine your pattern]");
  });

  test("clamps limit to the max of 200", async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      key: `k${i}`,
      created_at: "2026-08-08T00:00:00Z",
    }));
    const tool = createFindArtifactTool({ artifactStore: storeWith(many) });
    const result = await tool.execute({ limit: 1000 }, makeEmptyContext());
    expect(result.content).toContain("[showing 200 of 250 artifacts - refine your pattern]");
  });

  test("clamps limit to the min of 1", async () => {
    const tool = createFindArtifactTool({ artifactStore: storeWith(ITEMS) });
    const result = await tool.execute({ limit: 0 }, makeEmptyContext());
    expect(result.content).toContain("[showing 1 of 3 artifacts - refine your pattern]");
  });

  test("no matches reports a message", async () => {
    const tool = createFindArtifactTool({ artifactStore: storeWith(ITEMS) });
    const result = await tool.execute({ pattern: "nonexistent/*" }, makeEmptyContext());
    expect(result.content).toBe("No artifacts matching: nonexistent/*");
    expect(result.details).toEqual({
      kind: "artifact-list",
      matches: [],
      total: 0,
      truncated: false,
    });
  });

  test("empty store reports a message", async () => {
    const tool = createFindArtifactTool({ artifactStore: storeWith([]) });
    const result = await tool.execute({}, makeEmptyContext());
    expect(result.content).toBe("No artifacts matching: **");
  });
});
