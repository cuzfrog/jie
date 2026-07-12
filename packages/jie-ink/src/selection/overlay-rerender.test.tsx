import React from "react";
import { test, expect } from "bun:test";
import { Writable, Readable } from "node:stream";
import { render, useInput, Text, Box } from "@cuzfrog/jie-ink";
import chalk from "chalk";

const ESC = String.fromCharCode(0x1b);

class TestStdout extends Writable {
  readonly chunks: string[] = [];
  override _write(chunk: Buffer | string, _enc: string, cb: () => void): void {
    this.chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    cb();
  }
}

class TestStdin extends Readable {
  ref(): this { return this; }
  unref(): this { return this; }
  override _read(): void {}
  pushString(s: string): void {
    this.push(Buffer.from(s, "utf8"));
  }
}

function MouseProbe(): React.ReactNode {
  useInput(() => {});
  return React.createElement("ink-text", null, "hello world");
}

function GreyMouseProbe(): React.ReactNode {
  useInput(() => {});
  return React.createElement(Text, { color: "grey" }, "hello world");
}

function GreyBorderProbe(): React.ReactNode {
  useInput(() => {});
  return React.createElement(
    Box,
    {borderStyle: "round", borderColor: "grey", width: 8, height: 3},
    React.createElement(Text, null, "hi"),
  );
}

function SingleBorderProbe(): React.ReactNode {
  useInput(() => {});
  return React.createElement(
    Box,
    {borderStyle: "single", borderColor: "grey", width: 8, height: 3},
    React.createElement(Text, null, "hi"),
  );
}

function PartialBorderProbe(): React.ReactNode {
  useInput(() => {});
  return React.createElement(
    Box,
    {
      borderStyle: "single",
      borderColor: "grey",
      borderTop: true,
      borderBottom: true,
      borderLeft: false,
      borderRight: false,
      width: 8,
      height: 3,
    },
    React.createElement(Text, null, "hi"),
  );
}

/**
 * Regression test: the selection overlay's reverse-video frame must
 * NOT be wiped by Ink's repaint cycle. Previously the overlay wrote
 * through `writeToStdout`, which clears the screen and repaints the
 * whole Ink frame, erasing the highlight that was just drawn. The
 * fix routes the overlay's writer straight to `options.stdout` so the
 * reverse-video frame survives any subsequent Ink rerender.
 *
 * The test:
 *   1. Renders a frame, drives an SGR press + drag.
 *   2. Triggers an Ink rerender (a fresh state write via Ink's normal path).
 *   3. Asserts that the overlay's reverse-video bytes appear AFTER the
 *      rerender's repaint, not before-and-wiped.
 *   4. Releases and asserts OSC 52 carries the dragged text.
 */
test("selection overlay survives Ink rerender (writes to stdout directly)", async () => {
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(MouseProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  // Drive press -> drag, but DON'T release yet — keep selection alive.
  stdin.pushString(`${ESC}[<0;2;1M`);
  stdin.pushString(`${ESC}[<32;5;1M`);
  await new Promise(r => setTimeout(r, 200));

  // The overlay should have painted reverse-video at least once during
  // the drag. This is the only assertion the previous (buggy) wiring
  // happened to satisfy; the assertions below pin the fix.
  const all = stdout.chunks.join("");
  expect(all).toContain("\x1b[7m");

  // The overlay's writer must NOT be wrapped by Ink's erase+restore cycle.
  // Old behavior emitted, for every drag tick: <eraseLines><overlay><full-repaint>.
  // New behavior emits the overlay frame as a raw stdout write bracketed by
  // save/restore cursor. So no Ink-erase sequence may immediately precede the
  // overlay's reverse-video sequence (the overlay's `\x1b[s` comes from
  // buildOverlayFrame and is followed directly by `\x1b[<row>;<col>H`).
  const reverseVideoIndex = all.indexOf("\x1b[7m");
  const windowBefore = all.slice(Math.max(0, reverseVideoIndex - 24), reverseVideoIndex);
  // Ink's erase pattern is "erase-line + cursor-up" repeated; the overlay
  // must not be preceded by Ink's restore logic.
  expect(windowBefore).not.toMatch(/\x1b\[2K.*\x1b\[1A/);

  // After release, OSC 52 should be emitted exactly once with the dragged text.
  stdin.pushString(`${ESC}[<0;5;1m`);
  await new Promise(r => setTimeout(r, 200));
  const finalAll = stdout.chunks.join("");
  expect(finalAll).toContain("\x1b]52;c;");
  // Press at col=2, drag to col=5 -> "ello" -> base64 "ZWxsbw=="
  expect(finalAll).toContain("ZWxsbw==");

  instance.unmount();
});

/**
 * Issue 2 (transparent highlight): the overlay must paint the underlying
 * CHARACTER with reverse-video, not a blank space. The character wrapped
 * in SGR 7 keeps the glyph visible while foreground/background swap,
 * matching native terminal selection. A drag across "hello world" from
 * col=2 to col=5 must produce a frame that contains `e`, `l`, `l`, `o`
 * each inside the `\x1b[7m...\x1b[27m` brackets, NOT blank spaces.
 */
test("selection overlay preserves underlying character under reverse-video", async () => {
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(MouseProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  stdin.pushString(`${ESC}[<0;2;1M`);
  stdin.pushString(`${ESC}[<32;5;1M`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  // Each selected char must appear at least once between SGR 7m and SGR 27m.
  // Old behavior wrote ` ` (space) under reverse-video, hiding the text.
  expect(all).toMatch(/\x1b\[7me\x1b\[27m/);
  expect(all).toMatch(/\x1b\[7ml\x1b\[27m/);
  expect(all).toMatch(/\x1b\[7mo\x1b\[27m/);

  instance.unmount();
});

/**
 * Issue 1 (highlight stays on release): when the user releases the mouse
 * button, the cells that were painted with reverse-video must be repainted
 * with the underlying character WITHOUT reverse-video. The previous
 * implementation wrote `\x1b[s\x1b[u` (a no-op cursor save/restore), which
 * left the highlighted blocks in place. After release the stdout must
 * contain the underlying chars without SGR 7 around them at the same
 * positions.
 */
test("selection clears reverse-video on release (cells repainted plain)", async () => {
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(MouseProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  stdin.pushString(`${ESC}[<0;2;1M`);
  stdin.pushString(`${ESC}[<32;5;1M`);
  await new Promise(r => setTimeout(r, 200));

  stdin.pushString(`${ESC}[<0;5;1m`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  // After release, the overlay must write the underlying chars WITHOUT
  // SGR 7 to erase the highlight. Look for a "\x1b[<r>;<c>H" sequence
  // followed by a literal character (e/l/l/o) and not preceded by
  // reverse-video inside the same recent paint.
  expect(all).toMatch(/\x1b\[\d+;\d+H(?!\x1b\[7m)[el]+/);
  // And OSC 52 still emitted with the dragged text on release.
  expect(all).toContain("\x1b]52;c;");
  expect(all).toContain("ZWxsbw==");

  instance.unmount();
});

/**
 * Issue 3 (style preservation): the overlay must preserve each cell's
 * original fg/bg when restoring it on release. Previously the clear frame
 * wrote `\x1b[<r>;<c>H<char>` with no SGR prefix, so a cell whose original
 * fg was grey245 ended up with default fg (white) — "grey text became
 * white." Fix: the materializer captures each cell's active SGR, and the
 * overlay writes `<sgr><char><reset>` so the restored cell has the same
 * styling Ink painted.
 */
test("selection restores original fg on release (grey stays grey)", async () => {
  const originalLevel = chalk.level;
  chalk.level = 3;
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(GreyMouseProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  // Drag across cols 2..5 of the rendered text ("ello" from "hello world").
  stdin.pushString(`${ESC}[<0;2;1M`);
  stdin.pushString(`${ESC}[<32;5;1M`);
  await new Promise(r => setTimeout(r, 200));

  stdin.pushString(`${ESC}[<0;5;1m`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  // After release, the clear frame must re-emit each selected char with
  // its original fg SGR (`\e[90m` is chalk's "grey") followed by the
  // char and `\e[0m`. A plain char write with no SGR would leave the cell
  // at default fg (white), which is the bug this test pins.
  const fgPrefix = "\x1b[90m";
  expect(all).toMatch(new RegExp(`${escapeRegExp(fgPrefix)}[el]+`));
  // And the active selection must also carry the fg prefix around reverse,
  // so the cell renders with the original color AND inverted fg/bg.
  expect(all).toMatch(new RegExp(`${escapeRegExp(fgPrefix)}\x1b\\[7m[el]+\x1b\\[27m`));

  chalk.level = originalLevel;
  instance.unmount();
});

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Issue 4 (border style preservation): a `<Box borderColor="grey">` paints
 * its border glyphs (╭ ╮ ╰ ╯ │ ─) with the chalk "grey" fg SGR. The
 * previous materializer hardcoded sgr='' for border cells, so when the
 * overlay's clear frame restored them after release, it wrote the glyph
 * with no SGR — making the borders lose their color (same flavor as the
 * grey-text bug, but for borders). Fix: the materializer computes the
 * same SGR renderBorder applies and attaches it to each border cell.
 */
test("selection restores original border fg on release (grey border stays grey)", async () => {
  const originalLevel = chalk.level;
  chalk.level = 3;
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(GreyBorderProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  // Drag across the top border row (row 1, cols 1..4) — covers corner + side.
  stdin.pushString(`${ESC}[<0;1;1M`);
  stdin.pushString(`${ESC}[<32;4;1M`);
  await new Promise(r => setTimeout(r, 200));

  stdin.pushString(`${ESC}[<0;4;1m`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  // The clear frame must re-emit each border glyph with its fg SGR prefix
  // (\e[90m is chalk's grey). Without per-cell sgr on border cells, the
  // overlay would write the glyph with no SGR and the border would lose
  // its color. Anchor the assertion to the LAST write the overlay emits
  // (i.e. the chunk that ends at the OSC 52 sequence) — that is the
  // restore frame, not Ink's original paint. Inside that chunk we must
  // find the fg prefix followed by a corner glyph (╭ ╮ ╯ ╰).
  const fgPrefix = "\x1b[90m";
  const cornerChars = ["╭", "╮", "╰", "╯"];
  const cornerPattern = cornerChars.map(escapeRegExp).join("|");
  const osc52Idx = all.indexOf("\x1b]52;c;");
  expect(osc52Idx).toBeGreaterThan(-1);
  const lastOverlayChunk = all.slice(0, osc52Idx);
  // The clear frame: a sequence of moveCursor + (something) + border glyph
  // pieces. Pinpoint: a moveCursor immediately followed by the fg prefix
  // and a corner glyph. Before the fix the clear frame wrote the corner
  // with no fg prefix between moveCursor and the glyph, so this pattern
  // would not match the last overlay chunk.
  const moveCursor = "\\x1b\\[\\d+;\\d+H";
  expect(lastOverlayChunk).toMatch(
    new RegExp(`${moveCursor}${escapeRegExp(fgPrefix)}(?:${cornerPattern})`),
  );

  chalk.level = originalLevel;
  instance.unmount();
});

/**
 * Issue 5 (border glyph after release): user reports that after dragging across
 * a single-line border row and releasing, the 2nd cell from each end of the
 * horizontal lines visually turns into a corner char (e.g. `┌`), breaking the
 * border rendering. Capture the cell content the materializer records for the
 * top row of a single-style grey border, and assert:
 *   - col 1 = ┌ (top-left corner)
 *   - col 2..7 = ─ (horizontal)
 *   - col 8 = ┐ (top-right corner)
 * If the materializer pushes the wrong glyph at the inner cells, the overlay's
 * clear frame overwrites Ink's dashes with the wrong char on release.
 */
test("single-style border materializer records correct glyph at every cell", async () => {
  const originalLevel = chalk.level;
  chalk.level = 3;
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(SingleBorderProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  // Drag across the top border row, extending to the right corner, then release.
  stdin.pushString(`${ESC}[<0;1;1M`);
  stdin.pushString(`${ESC}[<32;8;1M`);
  await new Promise(r => setTimeout(r, 100));
  stdin.pushString(`${ESC}[<0;8;1m`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  // The clear frame restores every cell on row 1 with its original char.
  // Extract each moveCursor + fg + char triple from the LAST overlay chunk.
  const osc52Idx = all.indexOf("\x1b]52;c;");
  expect(osc52Idx).toBeGreaterThan(-1);
  const lastOverlayChunk = all.slice(0, osc52Idx);
  const fgPrefix = "\x1b[90m";
  const cellRegex = new RegExp(
    `\\x1b\\[1;(\\d+)H${escapeRegExp(fgPrefix)}(.)`,
    "g",
  );
  const cells: Array<{col: number; char: string}> = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(lastOverlayChunk)) !== null) {
    cells.push({col: Number(m[1]), char: m[2] ?? ""});
  }
  expect(cells.length).toBeGreaterThanOrEqual(8);
  const byCol = new Map(cells.map(c => [c.col, c.char]));
  expect(byCol.get(1)).toBe("┌");
  expect(byCol.get(2)).toBe("─");
  expect(byCol.get(3)).toBe("─");
  expect(byCol.get(4)).toBe("─");
  expect(byCol.get(5)).toBe("─");
  expect(byCol.get(6)).toBe("─");
  expect(byCol.get(7)).toBe("─");
  expect(byCol.get(8)).toBe("┐");

  chalk.level = originalLevel;
  instance.unmount();
});

/**
 * Issue 5 (partial border glyph after release): `<Box borderTop borderBottom
 * borderLeft={false} borderRight={false}>` (the editor's shape) renders ONLY
 * horizontal lines — no corners. Ink paints `──────` on row 1 and row N. The
 * materializer must mirror that: push `─` at every col of row 1 / row N, NOT
 * `┌` / `┐` at the ends. The previous implementation unconditionally pushed
 * the corner glyphs at the row ends, so after release the clear frame
 * overwrote Ink's end dashes with corner chars — the user saw "the 4 ends of
 * the border lines (2 lines) becomes corner like this ┌" after every drag.
 */
test("partial border (top/bottom only) materializer records ─ at every cell", async () => {
  const originalLevel = chalk.level;
  chalk.level = 3;
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(PartialBorderProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 80));

  // Drag across the entire top border row then release at col 8.
  stdin.pushString(`${ESC}[<0;1;1M`);
  stdin.pushString(`${ESC}[<32;8;1M`);
  await new Promise(r => setTimeout(r, 100));
  stdin.pushString(`${ESC}[<0;8;1m`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  const osc52Idx = all.indexOf("\x1b]52;c;");
  expect(osc52Idx).toBeGreaterThan(-1);
  const lastOverlayChunk = all.slice(0, osc52Idx);
  const fgPrefix = "\x1b[90m";
  const cellRegex = new RegExp(
    `\\x1b\\[1;(\\d+)H${escapeRegExp(fgPrefix)}(.)`,
    "g",
  );
  const cells: Array<{col: number; char: string}> = [];
  let m: RegExpExecArray | null;
  while ((m = cellRegex.exec(lastOverlayChunk)) !== null) {
    cells.push({col: Number(m[1]), char: m[2] ?? ""});
  }
  expect(cells.length).toBeGreaterThanOrEqual(8);
  const byCol = new Map(cells.map(c => [c.col, c.char]));
  // Every cell on row 1 must be `─` — no corners, because Ink painted none.
  for (let c = 1; c <= 8; c += 1) {
    expect(byCol.get(c)).toBe("─");
  }

  chalk.level = originalLevel;
  instance.unmount();
});
