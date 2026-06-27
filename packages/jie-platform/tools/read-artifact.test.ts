import { createReadArtifactTool } from "./read-artifact";
import { createArtifactStore, createStorage } from "../storage";

function makeStore() {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createArtifactStore(storage);
}

describe("read_artifact", () => {
  test("hit: LLM content is the artifact's content; details carries key+content+created_at", async () => {
    const store = makeStore();
    await store.write("k", "body");
    const tool = createReadArtifactTool({ artifactStore: store });
    const result = await tool.execute({ key: "k" }, {} as never);
    expect(result.content).toBe("body");
    const details = result.details as {
      key: string;
      content: string;
      created_at: string;
    };
    expect(details.key).toBe("k");
    expect(details.content).toBe("body");
    expect(typeof details.created_at).toBe("string");
  });

  test("miss: LLM content is 'Artifact not found: <key>'; details is null", async () => {
    const store = makeStore();
    const tool = createReadArtifactTool({ artifactStore: store });
    const result = await tool.execute({ key: "missing" }, {} as never);
    expect(result.content).toBe("Artifact not found: missing");
    expect(result.details).toBeNull();
  });
});
