import { createWriteArtifactTool } from "./write-artifact";
import type { ArtifactStore } from "../storage";
import { makeEmptyContext } from "./_test-context";

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

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
});
