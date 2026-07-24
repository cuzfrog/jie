import type { Component } from "@earendil-works/pi-tui";
import { SplitPane, panelWidth } from "./split-pane";

describe("SplitPane", () => {
  test("joins both sides with the separator and pads the left to its width", () => {
    const pane = new SplitPane(stub(["aa"]), stub(["xx"]), () => 3);
    expect(pane.render(10).map(stripAnsi)).toEqual(["aa │xx"]);
  });

  test("pads the shorter side up to the height of the taller one", () => {
    const pane = new SplitPane(stub(["a", "bb"]), stub(["x", "y", "z"]), () => 2);
    expect(pane.render(8).map(stripAnsi)).toEqual(["a │x", "bb│y", "  │z"]);
  });

  test("renders the right side alone at full width when the width function returns null", () => {
    const echo: Component = { render: (width) => [`w=${width}`], invalidate: (): void => undefined };
    const pane = new SplitPane(stub(["never"]), echo, () => null);
    expect(pane.render(10)).toEqual(["w=10"]);
  });

  test("places the separator at the left width even for a short left line", () => {
    const pane = new SplitPane(stub(["left line"]), stub(["right"]), () => 12);
    for (const line of pane.render(30)) {
      expect(stripAnsi(line).indexOf("│")).toBe(12);
    }
  });

  test("invalidate reaches both sides", () => {
    const leftInvalidate = vi.fn();
    const rightInvalidate = vi.fn();
    const pane = new SplitPane(stub([], leftInvalidate), stub([], rightInvalidate), () => 4);
    pane.invalidate();
    expect(leftInvalidate).toHaveBeenCalledTimes(1);
    expect(rightInvalidate).toHaveBeenCalledTimes(1);
  });
});

describe("panelWidth", () => {
  test("reserves a fixed 24 columns on terminals of 80 or more", () => {
    expect(panelWidth(80)).toBe(24);
    expect(panelWidth(200)).toBe(24);
  });

  test("takes a quarter of narrow terminals, clamped to a 12 column minimum", () => {
    expect(panelWidth(79)).toBe(19);
    expect(panelWidth(48)).toBe(12);
    expect(panelWidth(33)).toBe(12);
  });

  test("collapses when the chat column would drop below 20", () => {
    expect(panelWidth(32)).toBeNull();
    expect(panelWidth(10)).toBeNull();
  });
});

function stub(lines: ReadonlyArray<string>, invalidate: () => void = (): void => undefined): Component {
  return { render: (): string[] => [...lines], invalidate };
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
