import { test, expect, describe } from "bun:test";
import type { CellPosition } from "./selection-engine";
import { createCachedMaterializer } from "./cached-materializer";

function makeGrid(n: number): ReadonlyArray<ReadonlyArray<CellPosition>> {
  const g: CellPosition[][] = [];
  for (let i = 0; i < n; i += 1) {
    g.push([{ row: i + 1, column: 1, text: "x", sgr: "" }]);
  }
  return g;
}

describe("createCachedMaterializer", () => {
  test("returns the same memoized grid on repeated calls; source runs once", () => {
    let calls = 0;
    const source = (): ReadonlyArray<ReadonlyArray<CellPosition>> => {
      calls += 1;
      return makeGrid(5);
    };
    const cached = createCachedMaterializer(source);

    const a = cached();
    const b = cached();
    const c = cached();

    expect(calls).toBe(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test("recomputes after invalidate() is called", () => {
    let calls = 0;
    const source = (): ReadonlyArray<ReadonlyArray<CellPosition>> => {
      calls += 1;
      return makeGrid(calls);
    };
    const cached = createCachedMaterializer(source);

    cached();
    expect(calls).toBe(1);

    cached.invalidate();
    const next = cached();
    expect(calls).toBe(2);
    expect(next.length).toBe(2);

    const next2 = cached();
    expect(next2).toBe(next);
    expect(calls).toBe(2);
  });

  test("falls back to an empty grid on source error and retries on the next call", () => {
    let calls = 0;
    const source = (): ReadonlyArray<ReadonlyArray<CellPosition>> => {
      calls += 1;
      if (calls === 1) throw new Error("boom");
      return makeGrid(2);
    };
    const cached = createCachedMaterializer(source);

    expect(cached()).toEqual([]);
    // After the failed call the cache self-invalidates, so the next call retries.
    const recovered = cached();
    expect(calls).toBe(2);
    expect(recovered.length).toBe(2);
  });
});