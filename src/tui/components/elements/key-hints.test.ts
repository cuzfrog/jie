import { visibleWidth } from "@earendil-works/pi-tui";
import { hintLines } from "./key-hints";

describe("hintLines", () => {
  test("renders the core bindings as key-description pairs", () => {
    const text = hintLines(200).map(stripAnsi).join("\n");
    expect(text).toContain("enter send");
    expect(text).toContain("tab complete");
    expect(text).toContain("mention a file");
    expect(text).toContain("ctrl+k kanban");
    expect(text).not.toContain("ctrl+k kanban panel");
    expect(text).toContain("ctrl+d quit");
  });

  test("lays the hints out on a single line when the width is ample", () => {
    expect(hintLines(300).length).toBe(1);
  });

  test("wraps the hints across more lines as the width narrows", () => {
    expect(hintLines(60).length).toBeGreaterThan(hintLines(300).length);
  });

  test("every hint line fits the given width", () => {
    for (const width of [13, 40, 60, 80, 139]) {
      for (const line of hintLines(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
