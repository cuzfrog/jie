import { computeNextOffset, planNavigation } from "./chat-navigate";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("computeNextOffset", () => {
  test("clamps below 0", () => {
    expect(computeNextOffset(5, -10, 100)).toBe(0);
  });

  test("clamps above tailOffset", () => {
    expect(computeNextOffset(80, 50, 100)).toBe(100);
  });

  test("returns the literal middle value", () => {
    expect(computeNextOffset(50, 10, 100)).toBe(60);
  });

  test("zero delta returns current", () => {
    expect(computeNextOffset(50, 0, 100)).toBe(50);
  });
});

describe("planNavigation", () => {
  test("zero delta is noop", () => {
    expect(planNavigation({ scrollOffset: 10, tailOffset: 100 }, 0)).toEqual({ kind: "noop" });
  });

  test("empty content (tailOffset 0) is noop", () => {
    expect(planNavigation({ scrollOffset: 0, tailOffset: 0 }, 5)).toEqual({ kind: "noop" });
  });

  test("scroll up out of tail-pin returns a finite scroll", () => {
    const out = planNavigation({ scrollOffset: 100, tailOffset: 100 }, -19);
    expect(out).toEqual({ kind: "scroll", newOffsetRows: 81 });
  });

  test("scroll down past current into the tail is a noop (already at tail)", () => {
    const out = planNavigation({ scrollOffset: 200, tailOffset: 200 }, 10);
    expect(out).toEqual({ kind: "noop" });
  });

  test("scroll down into the tail when not at tail repins to tail", () => {
    const out = planNavigation({ scrollOffset: 80, tailOffset: 100 }, 50);
    expect(out).toEqual({ kind: "repin-tail" });
  });

  test("scroll down exactly to tail repins", () => {
    const out = planNavigation({ scrollOffset: 81, tailOffset: 100 }, 19);
    expect(out).toEqual({ kind: "repin-tail" });
  });

  test("scroll up at top stays noop", () => {
    expect(planNavigation({ scrollOffset: 0, tailOffset: 100 }, -10)).toEqual({ kind: "noop" });
  });
});
