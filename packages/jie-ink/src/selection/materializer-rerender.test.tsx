import React from "react";
import { test, expect } from "bun:test";
import { Writable, Readable } from "node:stream";
import { render, Box, useInput, useWindowSize } from "@cuzfrog/jie-ink";

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

function Probe(): React.ReactNode {
  const { columns, rows } = useWindowSize();
  useInput(() => {});
  return React.createElement(
    Box,
    {flexDirection: "column", width: columns, height: rows},
    React.createElement("ink-text", null, "no focused agent"),
    React.createElement(Box, {flexGrow: 1, borderStyle: "round"}),
    React.createElement("ink-text", null, "/tmp (main)"),
  );
}

test("full drag selection with box layout writes OSC 52", async () => {
  const stdout = new TestStdout();
  Object.defineProperty(stdout, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdout, "columns", { value: 80, configurable: true });
  Object.defineProperty(stdout, "rows", { value: 24, configurable: true });
  const stdin = new TestStdin();
  Object.defineProperty(stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(stdin, "setRawMode", { value: () => {}, configurable: true });

  const instance = render(React.createElement(Probe), {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    stderr: stdout as unknown as NodeJS.WriteStream,
    exitOnCtrlC: false,
    patchConsole: false,
    alternateScreen: true,
  });
  await new Promise(r => setTimeout(r, 100));

  // Drag across "no focused agent" text on row 1
  stdin.pushString(`${ESC}[<0;2;1M`);
  await new Promise(r => setTimeout(r, 50));
  stdin.pushString(`${ESC}[<32;5;1M`);
  await new Promise(r => setTimeout(r, 50));
  stdin.pushString(`${ESC}[<0;5;1m`);
  await new Promise(r => setTimeout(r, 200));

  const all = stdout.chunks.join("");
  console.error("RV=" + (all.includes("\x1b[7m") ? "yes" : "no"));
  console.error("OSC52=" + (all.includes("\x1b]52;c;") ? "yes" : "no"));
  // Look for any base64 encoded text near OSC 52
  const oscIdx = all.indexOf("\x1b]52;c;");
  if (oscIdx >= 0) console.error("OSC52_TAIL=" + JSON.stringify(all.slice(oscIdx, oscIdx + 40)));
  expect(all).toContain("\x1b]52;c;");
  instance.unmount();
});