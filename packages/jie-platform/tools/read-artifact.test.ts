import { createReadArtifactTool } from "./read-artifact";
import { createArtifactStore, createStorage } from "../storage";
import { makeEmptyContext } from "./_test-context";

function makeStore() {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createArtifactStore(storage);
}

describe("read_artifact", () => {
  test("hit: LLM content is the artifact's content; details carries key+content+created_at", async () => {
    const store = makeStore();
    await store.write("k", "body");
    const tool = createReadArtifactTool({ artifactStore: store });
    const result = await tool.execute({ key: "k" }, makeEmptyContext());
    expect(result.content).toBe("body");
    expect(result.details).toEqual({
      key: "k",
      content: "body",
      created_at: expect.any(String),
    });
  });

  test("miss: LLM content is 'Artifact not found: <key>'; details is null", async () => {
    const store = makeStore();
    const tool = createReadArtifactTool({ artifactStore: store });
    const result = await tool.execute({ key: "missing" }, makeEmptyContext());
    expect(result.content).toBe("Artifact not found: missing");
    expect(result.details).toBeNull();
  });
});
