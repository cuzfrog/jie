import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileMutationQueue } from "./file-mutation-queue";

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met within 1s");
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe("fileMutationQueue", () => {
  test("serializes operations on the same path", async () => {
    const queue = createFileMutationQueue();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    const first = queue.run("/a.txt", async () => { order.push("first-start"); await gate; order.push("first-end"); return 1; });
    const second = queue.run("/a.txt", async () => { order.push("second"); return 2; });
    await waitFor(() => order.length > 0);
    expect(order).toEqual(["first-start"]);
    release();
    expect(await first).toBe(1);
    expect(await second).toBe(2);
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });

  test("operations on different paths do not wait for each other", async () => {
    const queue = createFileMutationQueue();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    const first = queue.run("/a.txt", async () => { order.push("first-start"); await gate; order.push("first-end"); });
    await queue.run("/b.txt", async () => { order.push("second"); });
    expect(order).toEqual(["first-start", "second"]);
    release();
    await first;
    expect(order).toEqual(["first-start", "second", "first-end"]);
  });

  test("a failing operation releases the queue for the next one", async () => {
    const queue = createFileMutationQueue();
    const order: string[] = [];
    const first = queue.run("/a.txt", async () => { order.push("first"); throw new Error("boom"); });
    const second = queue.run("/a.txt", async () => { order.push("second"); return "ok"; });
    await expect(first).rejects.toThrow("boom");
    expect(await second).toBe("ok");
    expect(order).toEqual(["first", "second"]);
  });

  test("paths resolving to the same real file share one queue", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jie-queue-"));
    try {
      const realPath = join(dir, "real.txt");
      const linkPath = join(dir, "link.txt");
      writeFileSync(realPath, "x");
      symlinkSync(realPath, linkPath);
      const queue = createFileMutationQueue();
      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>((resolveRelease) => { release = resolveRelease; });
      const first = queue.run(realPath, async () => { order.push("first-start"); await gate; order.push("first-end"); });
      const second = queue.run(linkPath, async () => { order.push("second"); });
      await waitFor(() => order.length > 0);
      expect(order).toEqual(["first-start"]);
      release();
      await first;
      await second;
      expect(order).toEqual(["first-start", "first-end", "second"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a not-yet-existing path is queued by its resolved path", async () => {
    const queue = createFileMutationQueue();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolveRelease) => { release = resolveRelease; });
    const first = queue.run("/tmp/jie-missing/file.txt", async () => { order.push("first-start"); await gate; order.push("first-end"); });
    const second = queue.run("/tmp/jie-missing/file.txt", async () => { order.push("second"); });
    await waitFor(() => order.length > 0);
    expect(order).toEqual(["first-start"]);
    release();
    await first;
    await second;
    expect(order).toEqual(["first-start", "first-end", "second"]);
  });
});
