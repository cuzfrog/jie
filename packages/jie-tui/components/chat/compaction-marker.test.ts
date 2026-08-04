import { visibleWidth } from "@earendil-works/pi-tui";
import { CompactionMarkerMessage } from "./compaction-marker";

describe("CompactionMarkerMessage", () => {
  test("renders a header naming the token count, followed by the full summary", () => {
    const lines = new CompactionMarkerMessage({ seq: 0, summary: "kept the deploy notes", tokensBefore: 1234 }).render(200);
    expect(stripAnsi(lines[0]!)).toContain("1234");
    expect(stripAnsi(lines[0]!)).toContain("compacted");
    expect(lines.map(stripAnsi).join("\n")).toContain("kept the deploy notes");
  });

  test("styles the header dim", () => {
    const lines = new CompactionMarkerMessage({ seq: 0, summary: "s", tokensBefore: 1 }).render(80);
    expect(lines[0]).toContain("\x1b[90m");
  });

  test("every line fits the given width", () => {
    const summary = "word ".repeat(100).trim();
    for (const width of [13, 40, 80]) {
      for (const line of new CompactionMarkerMessage({ seq: 0, summary, tokensBefore: 1 }).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
