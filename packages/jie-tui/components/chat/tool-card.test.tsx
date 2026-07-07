import { ToolCard } from "./tool-card";
import { renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("ToolCard", () => {
  test("renders the success glyph when not errored", () => {
    const { lastFrame, unmount } = renderComponent(
      <ToolCard card={{ kind: "toolResult", callId: "1", name: "grep" }} expanded={false} />,
    );
    expect(lastFrame()).toContain("✓");
    expect(lastFrame()).toContain("grep");
    unmount();
  });

  test("renders the failure glyph and error message when errored", () => {
    const { lastFrame, unmount } = renderComponent(
      <ToolCard card={{ kind: "toolResult", callId: "1", name: "build", error: "boom" }} expanded={true} />,
    );
    expect(lastFrame()).toContain("✗");
    expect(lastFrame()).toContain("boom");
    unmount();
  });

  test("renders duration when present", () => {
    const { lastFrame, unmount } = renderComponent(
      <ToolCard card={{ kind: "toolResult", callId: "1", name: "x", durationMs: 42 }} expanded={false} />,
    );
    expect(lastFrame()).toContain("42ms");
    unmount();
  });

  test("expands input and output sections when expanded", () => {
    const { lastFrame, unmount } = renderComponent(
      <ToolCard
        card={{ kind: "toolResult", callId: "1", name: "x", input: "abc", output: "def" }}
        expanded={true}
      />,
    );
    const frame = lastFrame();
    expect(frame).toContain("input:");
    expect(frame).toContain("abc");
    expect(frame).toContain("output:");
    expect(frame).toContain("def");
    unmount();
  });
});