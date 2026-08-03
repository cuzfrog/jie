import { visibleWidth } from "@earendil-works/pi-tui";
import { DiffView } from "./diff-view";

describe("DiffView", () => {
  test("empty diff renders a muted placeholder", () => {
    expect(new DiffView("").render(80)).toEqual(["\x1b[90m(no textual diff)\x1b[39m"]);
  });

  test("colors add, del, ctx and meta lines, with the line number ahead of the marker", () => {
    const lines = new DiffView("@@ -1,1 +1,1 @@\n-old\n+new\n same").render(80);
    expect(lines[0]).toBe("\x1b[90m@@ -1,1 +1,1 @@\x1b[39m");
    expect(lines[1]).toBe("\x1b[90m1 \x1b[39m\x1b[31m- old\x1b[39m");
    expect(lines[2]).toBe("\x1b[90m1 \x1b[39m\x1b[32m+ new\x1b[39m");
    expect(lines[3]).toBe("\x1b[90m2 \x1b[39m\x1b[37m  same\x1b[39m");
  });

  test("del lines carry the old-file number, add and ctx lines the new-file number", () => {
    const lines = new DiffView("@@ -10,2 +20,2 @@\n ctx\n-gone\n+added").render(80);
    expect(lines[1]).toBe("\x1b[90m20 \x1b[39m\x1b[37m  ctx\x1b[39m");
    expect(lines[2]).toBe("\x1b[90m11 \x1b[39m\x1b[31m- gone\x1b[39m");
    expect(lines[3]).toBe("\x1b[90m21 \x1b[39m\x1b[32m+ added\x1b[39m");
  });

  test("line numbers are padded to the widest number in the diff", () => {
    const lines = new DiffView("@@ -8,2 +8,4 @@\n ctx\n+added nine\n+added ten\n ctx").render(80);
    expect(lines[1]).toBe("\x1b[90m 8 \x1b[39m\x1b[37m  ctx\x1b[39m");
    expect(lines[2]).toBe("\x1b[90m 9 \x1b[39m\x1b[32m+ added nine\x1b[39m");
    expect(lines[3]).toBe("\x1b[90m10 \x1b[39m\x1b[32m+ added ten\x1b[39m");
    expect(lines[4]).toBe("\x1b[90m11 \x1b[39m\x1b[37m  ctx\x1b[39m");
  });

  test("headers without a count default to one line", () => {
    const lines = new DiffView("@@ -1 +1 @@\n-old\n+new").render(80);
    expect(lines[1]).toBe("\x1b[90m1 \x1b[39m\x1b[31m- old\x1b[39m");
    expect(lines[2]).toBe("\x1b[90m1 \x1b[39m\x1b[32m+ new\x1b[39m");
  });

  test("lines without a diff marker render as unnumbered context", () => {
    expect(new DiffView("plain").render(80)).toEqual(["\x1b[37mplain\x1b[39m"]);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const view = new DiffView(`@@ -1,2 +1,2 @@\n+${"x".repeat(300)}\n-${"中文🎉".repeat(40)}\n ${"y".repeat(300)}`);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of view.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
