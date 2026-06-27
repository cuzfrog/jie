import { describe, expect, test } from "bun:test";
import { createWriteArtifactTool } from "./write-artifact.ts";
import { createArtifactStore, createStorage } from "../storage/index.ts";
import { JiePlatformError } from "../domain-types.ts";

function makeStore() {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createArtifactStore(storage);
}

describe("write_artifact", () => {
  test("success: content reports key + char count; details carries key + created_at", async () => {
    const store = makeStore();
    const tool = createWriteArtifactTool({ artifacts: store });
    const result = await tool.execute(
      { key: "task/plan", content: "hello" },
      {} as never,
    );
    expect(result.content).toBe("Stored artifact at task/plan (5 chars)");
    const details = result.details as { key: string; created_at: string };
    expect(details.key).toBe("task/plan");
    expect(typeof details.created_at).toBe("string");
  });

  test("invalid key -> invalid_artifact_key", async () => {
    const store = makeStore();
    const tool = createWriteArtifactTool({ artifacts: store });
    let caught: unknown;
    try {
      await tool.execute({ key: "bad space", content: "x" }, {} as never);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("invalid_artifact_key");
  });

  test("content > 5 MiB -> artifact_too_large", async () => {
    const store = makeStore();
    const tool = createWriteArtifactTool({ artifacts: store });
    const huge = "x".repeat(5 * 1024 * 1024 + 1);
    let caught: unknown;
    try {
      await tool.execute({ key: "k", content: huge }, {} as never);
    } catch (e) {
      caught = e;
    }
    expect((caught as JiePlatformError).code).toBe("artifact_too_large");
  });
});
