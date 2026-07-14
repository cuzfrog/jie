import { render } from "../../test-renderer";
import { ToolCard } from "./tool-card";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("ToolCard", () => {
  test("renders the success glyph when not errored", () => {
    const { lastFrame, unmount } = render(
      <ToolCard card={{ kind: "toolResult", callId: "1", name: "grep" }} expanded={false} />,
    );
    expect(lastFrame()).toContain("✓");
    expect(lastFrame()).toContain("grep");
    unmount();
  });

  test("renders the failure glyph and error message when errored", () => {
    const { lastFrame, unmount } = render(
      <ToolCard card={{ kind: "toolResult", callId: "1", name: "build", error: "boom" }} expanded={true} />,
    );
    expect(lastFrame()).toContain("✗");
    expect(lastFrame()).toContain("boom");
    unmount();
  });

  test("renders duration when present", () => {
    const { lastFrame, unmount } = render(
      <ToolCard card={{ kind: "toolResult", callId: "1", name: "x", durationMs: 42 }} expanded={false} />,
    );
    expect(lastFrame()).toContain("42ms");
    unmount();
  });

  test("expands input and output sections when expanded", () => {
    const { lastFrame, unmount } = render(
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

  test("renders a diff section when details.kind === 'diff' and details.diff is a non-empty string", () => {
    const { lastFrame, unmount } = render(
      <ToolCard
        card={{
          kind: "toolResult",
          callId: "1",
          name: "edit",
          output: "Edited a.txt: 1 replacement",
          details: { kind: "diff", path: "a.txt", replacementsCount: 1, diff: "@@ -1,1 +1,1 @@\n-a\n+A" },
        }}
        expanded={true}
      />,
    );
    const frame = lastFrame();
    expect(frame).toContain("diff:");
    expect(frame).toContain("@@");
    expect(frame).toContain("-a");
    expect(frame).toContain("+A");
    unmount();
  });

  test("does not render a diff section when details.kind is not 'diff'", () => {
    const { lastFrame, unmount } = render(
      <ToolCard
        card={{
          kind: "toolResult",
          callId: "1",
          name: "write_file",
          output: "ok",
          details: { path: "a.txt", diff: "@@ -1,1 +1,1 @@\n-a\n+A" },
        }}
        expanded={true}
      />,
    );
    expect(lastFrame()).not.toContain("diff:");
    unmount();
  });

  test("does not render a diff section when details is missing or empty", () => {
    const { lastFrame, unmount } = render(
      <ToolCard
        card={{ kind: "toolResult", callId: "1", name: "edit", output: "ok" }}
        expanded={true}
      />,
    );
    expect(lastFrame()).not.toContain("diff:");
    unmount();
  });

  test("does not render a diff section when details.diff is null or empty", () => {
    const { lastFrame: frame1, unmount: unmount1 } = render(
      <ToolCard
        card={{
          kind: "toolResult",
          callId: "1",
          name: "edit",
          output: "ok",
          details: { kind: "diff", diff: null },
        }}
        expanded={true}
      />,
    );
    expect(frame1()).not.toContain("diff:");
    unmount1();
  });
});


