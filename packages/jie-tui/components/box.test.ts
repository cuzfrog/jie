import { visibleWidth } from "@earendil-works/pi-tui";
import { Box } from "./box";
import { style } from "./themes";

const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*m/g, "");

describe("Box", () => {
  test("renders an empty boxed panel with default borders", () => {
    const lines = new Box([]).render(10);
    expect(lines).toHaveLength(2);
    expect(stripAnsi(lines[0])).toBe("┌────────┐");
    expect(stripAnsi(lines[1])).toBe("└────────┘");
  });

  test("pads short content so the right border aligns", () => {
    const lines = new Box(["hi"]).render(10);
    expect(lines).toHaveLength(3);
    expect(stripAnsi(lines[0])).toBe("┌────────┐");
    expect(stripAnsi(lines[1])).toBe("│ hi     │");
    expect(stripAnsi(lines[2])).toBe("└────────┘");
  });

  test("truncates content that is wider than the inner area", () => {
    const lines = new Box(["this is too long"]).render(10);
    expect(lines).toHaveLength(3);
    expect(stripAnsi(lines[1])).toBe("│ this i │");
  });

  test("allows a custom top and bottom border", () => {
    const top = style("borderMuted")("┌T─┐");
    const bottom = style("borderMuted")("└B─┘");
    const lines = new Box(["x"], { top, bottom }).render(10);
    expect(lines[0]).toBe(top);
    expect(lines[lines.length - 1]).toBe(bottom);
  });

  test("every rendered line fits the given width", () => {
    const lines = new Box(["a", "bc", "def"]).render(12);
    for (const line of lines) {
      expect(visibleWidth(line)).toBeLessThanOrEqual(12);
    }
  });
});
