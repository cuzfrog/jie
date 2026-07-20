import { render } from "../../test-renderer";
import { TextBlock } from "./text-block";

function stripAnsi(s: string): string {
  return s.replace(/\[[0-9;]*m/g, "");
}

describe("TextBlock", () => {
  test("renders assistant text with the ● prefix on the first line", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "text", text: "first\nsecond" }} expanded={true} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("● first");
    expect(frame).toContain("second");
    unmount();
  });

  test("collapsed thinking block renders the 'Thinking...' label", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "raw" }} expanded={false} />,
    );
    expect(stripAnsi(lastFrame() ?? "")).toContain("Thinking...");
    unmount();
  });

  test("expanded thinking block renders the body text indented", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "raw" }} expanded={true} />,
    );
    expect(stripAnsi(lastFrame() ?? "")).toContain("raw");
    unmount();
  });

  test("expanded thinking renders markdown list items through Markdown", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "- step one\n- step two" }} expanded={true} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("step one");
    expect(frame).toContain("step two");
    expect(frame).toContain("- ");
    expect(frame).not.toContain("Thinking...");
    unmount();
  });

  test("expanded thinking renders headings through Markdown", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "# plan\nitems" }} expanded={true} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("# plan");
    expect(frame).toContain("items");
    unmount();
  });

  test("expanded thinking renders fenced code blocks through Markdown", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "```ts\nconst x = 1;\n```" }} expanded={true} />,
    );
    expect(stripAnsi(lastFrame() ?? "")).toContain("const x = 1;");
    unmount();
  });

  test("empty collapsed thinking renders nothing (matches the scroll model's zero rows)", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "" }} expanded={false} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).not.toContain("Thinking...");
    expect(frame.trim()).toBe("");
    unmount();
  });

  test("empty expanded thinking renders nothing", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "" }} expanded={true} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).not.toContain("Thinking...");
    unmount();
  });

  test("renders markdown headings inside an assistant block", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "text", text: "# heading\nbody" }} expanded={true} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("heading");
    expect(frame).toContain("body");
    unmount();
  });

  test("renders markdown list items inside an assistant block", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "text", text: "- one\n- two" }} expanded={true} />,
    );
    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toContain("one");
    expect(frame).toContain("two");
    unmount();
  });
});
