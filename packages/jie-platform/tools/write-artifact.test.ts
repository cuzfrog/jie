import { createWriteArtifactTool } from "./write-artifact";
import { createArtifactStore, createStorage } from "../storage";
import { makeEmptyContext } from "./_test-context";

function makeStore() {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createArtifactStore(storage);
}

describe("write_artifact", () => {
  test("success: content reports key + char count; details carries key + created_at", async () => {
    const store = makeStore();
    const tool = createWriteArtifactTool({ artifactStore: store });
    const result = await tool.execute(
      { key: "task/plan", content: "hello" },
      makeEmptyContext(),
    );
    expect(result.content).toBe("Stored artifact at task/plan (5 chars)");
    const details = result.details as { key: string; created_at: string };
    expect(details.key).toBe("task/plan");
    expect(typeof details.created_at).toBe("string");
  });

  test("invalid key -> invalid_artifact_key", async () => {
    const store = makeStore();
    const tool = createWriteArtifactTool({ artifactStore: store });
    await expect(
      tool.execute({ key: "bad space", content: "x" }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "INVALID_ARTIFACT_KEY" });
  });

  test("content > 5 MiB -> artifact_too_large", async () => {
    const store = makeStore();
    const tool = createWriteArtifactTool({ artifactStore: store });
    const huge = "x".repeat(5 * 1024 * 1024 + 1);
    await expect(
      tool.execute({ key: "k", content: huge }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "ARTIFACT_TOO_LARGE" });
  });
});
