import { PassThrough } from "node:stream";
import { createStreamTerminal } from "./stream-terminal";

function makeStreams(): { stdin: PassThrough; written: () => string; stdout: NodeJS.WritableStream & { columns?: number; rows?: number }; emitter: PassThrough } {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  let acc = "";
  stdout.on("data", (d: Buffer) => { acc += d.toString(); });
  const out = stdout as NodeJS.WritableStream & { columns?: number; rows?: number };
  out.columns = 100;
  out.rows = 40;
  return { stdin, written: () => acc, stdout: out, emitter: stdout };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("createStreamTerminal — input", () => {
  test("forwards each keystroke as its own onInput call", async () => {
    const { stdin, stdout } = makeStreams();
    const terminal = createStreamTerminal(stdin, stdout);
    const inputs: string[] = [];
    terminal.start((d) => inputs.push(d), () => undefined);
    stdin.write("h");
    stdin.write("i");
    await sleep(20);
    expect(inputs).toEqual(["h", "i"]);
    terminal.stop();
  });

  test("splits a batched chunk into individual sequences", async () => {
    const { stdin, stdout } = makeStreams();
    const terminal = createStreamTerminal(stdin, stdout);
    const inputs: string[] = [];
    terminal.start((d) => inputs.push(d), () => undefined);
    stdin.write("hi\r");
    await sleep(20);
    expect(inputs).toEqual(["h", "i", "\r"]);
    terminal.stop();
  });

  test("coalesces an escape sequence split across chunks", async () => {
    const { stdin, stdout } = makeStreams();
    const terminal = createStreamTerminal(stdin, stdout);
    const inputs: string[] = [];
    terminal.start((d) => inputs.push(d), () => undefined);
    stdin.write("\x1b");
    stdin.write("[A");
    await sleep(30);
    expect(inputs).toEqual(["\x1b[A"]);
    terminal.stop();
  });

  test("re-wraps bracketed paste content with markers for the editor", async () => {
    const { stdin, stdout } = makeStreams();
    const terminal = createStreamTerminal(stdin, stdout);
    const inputs: string[] = [];
    terminal.start((d) => inputs.push(d), () => undefined);
    stdin.write("\x1b[200~hello\x1b[201~");
    await sleep(30);
    expect(inputs).toEqual(["\x1b[200~hello\x1b[201~"]);
    terminal.stop();
  });

  test("stop detaches stdin: later writes produce no input", async () => {
    const { stdin, stdout } = makeStreams();
    const terminal = createStreamTerminal(stdin, stdout);
    const inputs: string[] = [];
    terminal.start((d) => inputs.push(d), () => undefined);
    stdin.write("a");
    await sleep(20);
    terminal.stop();
    stdin.write("b");
    await sleep(20);
    expect(inputs).toEqual(["a"]);
  });

  test("drainInput flushes a pending incomplete sequence as input", async () => {
    const { stdin, stdout } = makeStreams();
    const terminal = createStreamTerminal(stdin, stdout);
    const inputs: string[] = [];
    terminal.start((d) => inputs.push(d), () => undefined);
    stdin.write("\x1b");
    await sleep(5);
    await terminal.drainInput();
    expect(inputs).toEqual(["\x1b"]);
    terminal.stop();
  });
});

describe("createStreamTerminal — output", () => {
  test("write passes bytes through to stdout", () => {
    const { stdout, written } = makeStreams();
    const terminal = createStreamTerminal(new PassThrough(), stdout);
    terminal.write("hello");
    expect(written()).toBe("hello");
  });

  test("cursor, clear, move, title, and progress operations emit the same ANSI sequences as ProcessTerminal", () => {
    const { stdout, written } = makeStreams();
    const terminal = createStreamTerminal(new PassThrough(), stdout);
    terminal.hideCursor();
    terminal.showCursor();
    terminal.clearLine();
    terminal.clearFromCursor();
    terminal.clearScreen();
    terminal.moveBy(2);
    terminal.moveBy(-3);
    terminal.setTitle("jie");
    terminal.setProgress(true);
    terminal.setProgress(false);
    expect(written()).toBe(
      "\x1b[?25l" + "\x1b[?25h" + "\x1b[K" + "\x1b[J" + "\x1b[2J\x1b[H" +
      "\x1b[2B" + "\x1b[3A" + "\x1b]0;jie\x07" + "\x1b]9;4;3\x07" + "\x1b]9;4;0;\x07",
    );
  });

  test("moveBy(0) writes nothing", () => {
    const { stdout, written } = makeStreams();
    const terminal = createStreamTerminal(new PassThrough(), stdout);
    terminal.moveBy(0);
    expect(written()).toBe("");
  });

  test("exposes the underlying stream dimensions and no kitty protocol", () => {
    const { stdout } = makeStreams();
    const terminal = createStreamTerminal(new PassThrough(), stdout);
    expect(terminal.columns).toBe(100);
    expect(terminal.rows).toBe(40);
    expect(terminal.kittyProtocolActive).toBe(false);
  });

  test("falls back to 80x24 when the stream has no dimensions", () => {
    const bare = new PassThrough() as NodeJS.WritableStream & { columns?: number; rows?: number };
    const terminal = createStreamTerminal(new PassThrough(), bare);
    expect(terminal.columns).toBe(80);
    expect(terminal.rows).toBe(24);
  });
});

describe("createStreamTerminal — resize", () => {
  test("forwards the stdout resize event to the onResize handler", () => {
    const { stdout, emitter } = makeStreams();
    const terminal = createStreamTerminal(new PassThrough(), stdout);
    let resizes = 0;
    terminal.start(() => undefined, () => { resizes++; });
    emitter.emit("resize");
    expect(resizes).toBe(1);
    terminal.stop();
  });

  test("stop detaches the resize listener", () => {
    const { stdout, emitter } = makeStreams();
    const terminal = createStreamTerminal(new PassThrough(), stdout);
    let resizes = 0;
    terminal.start(() => undefined, () => { resizes++; });
    terminal.stop();
    emitter.emit("resize");
    expect(resizes).toBe(0);
  });
});
