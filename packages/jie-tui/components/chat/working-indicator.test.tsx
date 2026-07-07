import { WorkingIndicator } from "./working-indicator";
import { SPINNER_FRAMES } from "../themes";
import { renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("WorkingIndicator", () => {
  test("renders one of the spinner frames", () => {
    const { lastFrame, unmount } = renderComponent(
      <WorkingIndicator message="Loading…" intervalMs={1000} />,
    );
    const frame = lastFrame();
    const hasFrame = SPINNER_FRAMES.some((glyph) => frame.includes(glyph));
    expect(hasFrame).toBe(true);
    expect(frame).toContain("Loading…");
    unmount();
  });

  test("uses the default 'Working…' message", () => {
    const { lastFrame, unmount } = renderComponent(<WorkingIndicator intervalMs={1000} />);
    expect(lastFrame()).toContain("Working…");
    unmount();
  });
});