import { describe, expect, test } from "bun:test";
import { SqliteStorage } from "./sqlite-storage";
import { SqliteArtifactStore, InMemoryArtifactStore } from "./artifact-store";
import { JiePlatformError } from "../domain-types";

function makeStore(): SqliteArtifactStore {
  return new SqliteArtifactStore(new SqliteStorage(":memory:"));
}

describe("SqliteArtifactStore", () => {
  test("write + read returns the entry with a created_at timestamp", async () => {
    const store = makeStore();
    const written = await store.write("a/b.txt", "hello");
    expect(written.key).toBe("a/b.txt");
    expect(typeof written.created_at).toBe("string");

    const read = await store.read("a/b.txt");
    expect(read).not.toBeNull();
    expect(read?.key).toBe("a/b.txt");
    expect(read?.content).toBe("hello");
    expect(read?.created_at).toBe(written.created_at);
  });

  test("read returns null for a missing key (normal result, not error)", async () => {
    const store = makeStore();
    expect(await store.read("nope")).toBeNull();
  });

  test("write overwrites an existing key (INSERT OR REPLACE)", async () => {
    const store = makeStore();
    await store.write("k", "v1");
    await store.write("k", "v2");
    const read = await store.read("k");
    expect(read?.content).toBe("v2");
  });

  test("list filters by prefix and orders by created_at DESC", async () => {
    const store = makeStore();
    await store.write("a/x.txt", "1");
    await new Promise((r) => setTimeout(r, 2));
    await store.write("a/y.txt", "2");
    await new Promise((r) => setTimeout(r, 2));
    await store.write("b/z.txt", "3");
    const a = await store.list("a/");
    expect(a.map((r) => r.key)).toEqual(["a/y.txt", "a/x.txt"]);
    const all = await store.list("");
    expect(all).toHaveLength(3);
  });

  test("list escapes LIKE metacharacters in the prefix (no wildcard semantics)", async () => {
    const store = makeStore();
    await store.write("ax", "v1");
    await store.write("ay", "v2");
    await store.write("a_", "v3");

    const list1 = await store.list("a%");
    expect(list1).toEqual([]);

    const list2 = await store.list("a_");
    expect(list2.map((r) => r.key)).toEqual(["a_"]);
  });

  test("write rejects invalid key with typed error invalid_artifact_key", async () => {
    const store = makeStore();
    let caught: unknown;
    try {
      await store.write("bad space", "x");
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("invalid_artifact_key");
    expect((caught as Error).message).toBe("invalid_artifact_key: bad space");
  });

  test("write rejects content over 5 MiB with typed error artifact_too_large", async () => {
    const store = makeStore();
    const huge = "x".repeat(5 * 1024 * 1024 + 1);
    let caught: unknown;
    try {
      await store.write("k", huge);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("artifact_too_large");
    expect((caught as Error).message).toBe(
      `artifact_too_large: ${huge.length}`,
    );
  });

  test("write accepts content exactly at 5 MiB", async () => {
    const store = makeStore();
    const max = "x".repeat(5 * 1024 * 1024);
    const w = await store.write("k", max);
    expect(w.key).toBe("k");
  });
});

describe("InMemoryArtifactStore", () => {
  test("implements the same interface; write/read/list round-trip", async () => {
    const store = new InMemoryArtifactStore();
    await store.write("a/b", "hello");
    expect((await store.read("a/b"))?.content).toBe("hello");
    expect(await store.read("missing")).toBeNull();
    expect((await store.list("a/")).map((r) => r.key)).toEqual(["a/b"]);
  });

  test("enforces the same key / content validations", async () => {
    const store = new InMemoryArtifactStore();
    await expect(store.write("bad space", "x")).rejects.toBeInstanceOf(
      JiePlatformError,
    );
    await expect(store.write("k", "x".repeat(5 * 1024 * 1024 + 1))).rejects.toBeInstanceOf(
      JiePlatformError,
    );
  });
});