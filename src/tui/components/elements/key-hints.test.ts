import { visibleWidth } from "@earendil-works/pi-tui";
import { KeyHintsImpl } from "./key-hints";

const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

describe("KeyHintsImpl", () => {
  test("renders the core bindings as key-description pairs", () => {
    const text = new KeyHintsImpl().lines(200).map(stripAnsi).join("\n");
    expect(text).toContain("enter send");
    expect(text).toContain("tab complete");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+k kanban");
    expect(text).not.toContain("ctrl+k kanban panel");
    expect(text).toContain("ctrl+d quit");
  });

  test("lays the hints out on a single line when the width is ample", () => {
    expect(new KeyHintsImpl().lines(300).length).toBe(1);
  });

  test("wraps the hints across more lines as the width narrows", () => {
    expect(new KeyHintsImpl().lines(60).length).toBeGreaterThan(new KeyHintsImpl().lines(300).length);
  });

  test("every hint line fits the given width", () => {
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of new KeyHintsImpl().lines(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
