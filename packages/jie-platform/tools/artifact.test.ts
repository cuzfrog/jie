import { describe, expect, test } from "bun:test";
import { createWriteArtifactTool } from "./write-artifact.ts";
import { createReadArtifactTool } from "./read-artifact.ts";
import { InMemoryArtifactStore } from "../storage/artifact-store.ts";
import { JiePlatformError } from "../domain-types.ts";

describe("write_artifact", () => {
  test("success: content reports key + char count; details carries key + created_at", async () => {
    const store = new InMemoryArtifactStore();
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
    const store = new InMemoryArtifactStore();
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
    const store = new InMemoryArtifactStore();
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

describe("read_artifact", () => {
  test("hit: LLM content is the artifact's content; details carries key+content+created_at", async () => {
    const store = new InMemoryArtifactStore();
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
    const store = new InMemoryArtifactStore();
    const tool = createReadArtifactTool({ artifactStore: store });
    const result = await tool.execute({ key: "missing" }, {} as never);
    expect(result.content).toBe("Artifact not found: missing");
    expect(result.details).toBeNull();
  });
});