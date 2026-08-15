import { visibleWidth } from "@earendil-works/pi-tui";
import { CompactionMarkerMessage } from "./compaction-marker";

function marker(summary: string, tokensBefore: number) {
  return { turnsBefore: 0, summary, tokensBefore };
}

describe("CompactionMarkerMessage", () => {
  test("renders a header naming the token count, followed by the full summary", () => {
    const lines = new CompactionMarkerMessage(marker("kept the deploy notes", 1234)).render(200);
    expect(stripAnsi(lines[0]!)).toContain("1234");
    expect(stripAnsi(lines[0]!)).toContain("compacted");
    expect(lines.map(stripAnsi).join("\n")).toContain("kept the deploy notes");
  });

  test("styles the header dim", () => {
    const lines = new CompactionMarkerMessage(marker("s", 1)).render(80);
    expect(lines[0]).toContain("\x1b[90m");
  });

  test("every line fits the given width", () => {
    const summary = "word ".repeat(100).trim();
    for (const width of [13, 40, 80]) {
      for (const line of new CompactionMarkerMessage(marker(summary, 1)).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });

  test("update replaces the marker for subsequent renders", () => {
    const message = new CompactionMarkerMessage(marker("first", 100));
    const before = message.render(80).map(stripAnsi).join("\n");
    expect(before).toContain("first");
    message.update(marker("second", 200));
    const after = message.render(80).map(stripAnsi).join("\n");
    expect(after).toContain("second");
    expect(after).toContain("200");
  });
});

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
