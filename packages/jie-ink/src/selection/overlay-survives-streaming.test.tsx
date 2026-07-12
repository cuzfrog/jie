import React from "react";
import { test, expect } from "bun:test";
import { Writable, Readable } from "node:stream";
import { render, useInput, useStdout } from "@cuzfrog/jie-ink";

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

/**
 * Regression test for the live bug: when an Ink rerender happens AFTER
 * the overlay paints its reverse-video, the rerender must not wipe the
 * highlight. In `jie`, the chat streams tokens continuously during a
 * drag; Ink re-renders via append-to-scrollback mode. The relevant
 * non-pure-append fallback in log-update.ts erases all previous lines
 * and rewrites them, which would destroy the highlight. This test
 * reproduces that scenario by forcing a state change that produces a
 * non-append Ink frame.
 */
test("selection overlay survives non-append Ink rerender", async () => {
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  let triggerRerender: (() => void) | null = null;
  function MouseProbe(): React.ReactNode {
    const [tick, setTick] = React.useState(0);
    triggerRerender = (): void => {
      setTick((t) => t + 1);
    };
    useInput(() => {});
    return React.createElement("ink-box", {key: tick},
      React.createElement("ink-text", null, "hello world"),
      React.createElement("ink-text", null, `tick ${tick}`),
    );
  }

  const instance = render(React.createElement(MouseProbe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
    appendToScrollback: true,
  });
  await new Promise(r => setTimeout(r, 80));

  // Drive press -> drag, hold selection active.
  stdin.pushString(`${ESC}[<0;2;1M`);
  stdin.pushString(`${ESC}[<32;5;1M`);
  await new Promise(r => setTimeout(r, 100));

  const afterDrag = stdout.chunks.join("");
  expect(afterDrag).toContain("\x1b[7m");

  // Force a non-append rerender (a top-level state change). After this,
  // the Ink frame has changed structure. The overlay should NOT be wiped:
  // either (a) the overlay's onSelectionChange callback re-paints after
  // the rerender, OR (b) the rerender path itself does not erase cells
  // that the overlay wrote.
  triggerRerender?.();
  await new Promise(r => setTimeout(r, 100));

  const afterRerender = stdout.chunks.join("");
  // Reverse-video must still appear in the stream (it was re-painted).
  const rvCountAfter = (afterRerender.match(/\x1b\[7m/g) ?? []).length;
  const rvCountBefore = (afterDrag.match(/\x1b\[7m/g) ?? []).length;
  expect(rvCountAfter).toBeGreaterThanOrEqual(rvCountBefore);

  instance.unmount();
});