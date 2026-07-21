import { visibleWidth } from "@earendil-works/pi-tui";
import { DiffView } from "./diff-view";

describe("DiffView", () => {
  test("empty diff renders a muted placeholder", () => {
    expect(new DiffView("").render(80)).toEqual(["\x1b[90m(no textual diff)\x1b[39m"]);
  });

  test("colors add, del, ctx and meta lines", () => {
    const lines = new DiffView("@@ -1,1 +1,1 @@\n-old\n+new\n same").render(80);
    expect(lines[0]).toBe("\x1b[90m@@ -1,1 +1,1 @@\x1b[39m");
    expect(lines[1]).toBe("\x1b[31m-old\x1b[39m");
    expect(lines[2]).toBe("\x1b[32m+new\x1b[39m");
    expect(lines[3]).toBe("\x1b[37m same\x1b[39m");
  });

  test("lines without a diff marker render as context", () => {
    expect(new DiffView("plain").render(80)).toEqual(["\x1b[37mplain\x1b[39m"]);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const view = new DiffView(`+${"x".repeat(300)}\n-${"中文🎉".repeat(40)}\n ${"y".repeat(300)}`);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of view.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
