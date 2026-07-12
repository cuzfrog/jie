import { render } from "../../test-renderer";
import { TextBlock } from "./text-block";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("TextBlock", () => {
  test("renders assistant text with the ● prefix on the first line", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "text", text: "first\nsecond" }} expanded={true} />,
    );
    const frame = lastFrame();
    expect(frame).toContain("● first");
    expect(frame).toContain("second");
    unmount();
  });

  test("collapsed thinking block renders the 'Thinking...' label", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "raw" }} expanded={false} />,
    );
    expect(lastFrame()).toContain("Thinking...");
    unmount();
  });

  test("expanded thinking block renders the body text indented", () => {
    const { lastFrame, unmount } = render(
      <TextBlock block={{ kind: "thinking", text: "raw" }} expanded={true} />,
    );
    expect(lastFrame()).toContain("raw");
    unmount();
  });
});