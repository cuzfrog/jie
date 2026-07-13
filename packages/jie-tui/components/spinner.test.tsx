import { render } from "../test-renderer";
import { Spinner, advanceFrameIndex } from "./spinner";
import { SPINNER_FRAMES } from "./themes";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("advanceFrameIndex", () => {
  test("returns the next index modulo the frames length", () => {
    expect(advanceFrameIndex(0)).toBe(1);
    expect(advanceFrameIndex(8)).toBe(9);
    expect(advanceFrameIndex(9)).toBe(0);
    expect(advanceFrameIndex(SPINNER_FRAMES.length - 1)).toBe(0);
  });
});

describe("Spinner", () => {
  test("renders the first frame on initial render", () => {
    const { lastFrame, unmount } = render(<Spinner />);
    expect(lastFrame()).toContain(SPINNER_FRAMES[0]);
    unmount();
  });
});