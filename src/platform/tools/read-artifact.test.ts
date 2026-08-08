import { createReadArtifactTool } from "./read-artifact";
import type { ArtifactStore } from "../storage";
import { makeEmptyContext } from "./_test-context";

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

describe("read_artifact", () => {
  test("hit: LLM content is the artifact's content; details carries key+content+created_at", async () => {
    artifactStore.read.mockResolvedValue({ key: "k", content: "body", created_at: "2026-07-23T00:00:00.000Z" });
    const tool = createReadArtifactTool({ artifactStore });
    const result = await tool.execute({ key: "k" }, makeEmptyContext());
    expect(artifactStore.read).toHaveBeenCalledWith("k");
    expect(result.content).toBe("body");
    expect(result.details).toEqual({
      key: "k",
      content: "body",
      created_at: "2026-07-23T00:00:00.000Z",
    });
  });

  test("miss: LLM content is 'Artifact not found: <key>'; details is null", async () => {
    artifactStore.read.mockResolvedValue(null);
    const tool = createReadArtifactTool({ artifactStore });
    const result = await tool.execute({ key: "missing" }, makeEmptyContext());
    expect(result.content).toBe("Artifact not found: missing");
    expect(result.details).toBeNull();
  });
});
