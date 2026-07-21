import { StdinBuffer, type Terminal } from "@earendil-works/pi-tui";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const STDIN_BUFFER_TIMEOUT_MS = 10;

const PROGRESS_ACTIVE_SEQUENCE = "\x1b]9;4;3\x07";
const PROGRESS_CLEAR_SEQUENCE = "\x1b]9;4;0;\x07";

export function createStreamTerminal(
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number },
): Terminal {
  let onInput: ((data: string) => void) | null = null;
  let buffer: StdinBuffer | null = null;
  let dataHandler: ((chunk: Buffer) => void) | null = null;
  let resizeEmitter: ResizeEmitter | null = null;
  let resizeHandler: (() => void) | null = null;

  const forward = (sequence: string): void => {
    onInput?.(sequence);
  };

  return {
    get columns(): number {
      return stdout.columns ?? DEFAULT_COLUMNS;
    },
    get rows(): number {
      return stdout.rows ?? DEFAULT_ROWS;
    },
    get kittyProtocolActive(): boolean {
      return false;
    },
    start(inputHandler: (data: string) => void, onResize: () => void): void {
      onInput = inputHandler;
      resizeHandler = onResize;
      buffer = new StdinBuffer({ timeout: STDIN_BUFFER_TIMEOUT_MS });
      buffer.on("data", forward);
      buffer.on("paste", (content) => forward(`\x1b[200~${content}\x1b[201~`));
      dataHandler = (chunk: Buffer): void => {
        buffer?.process(chunk.toString());
      };
      stdin.on("data", dataHandler);
      if (emitsResize(stdout)) {
        resizeEmitter = stdout;
        resizeEmitter.on("resize", onResize);
      }
    },
    stop(): void {
      if (dataHandler !== null) {
        stdin.removeListener("data", dataHandler);
        dataHandler = null;
      }
      if (resizeEmitter !== null && resizeHandler !== null) {
        resizeEmitter.removeListener("resize", resizeHandler);
        resizeEmitter = null;
      }
      resizeHandler = null;
      buffer?.destroy();
      buffer = null;
      onInput = null;
    },
    drainInput(): Promise<void> {
      const flushed = buffer?.flush() ?? [];
      for (const sequence of flushed) forward(sequence);
      return Promise.resolve();
    },
    write(data: string): void {
      stdout.write(data);
    },
    moveBy(lines: number): void {
      if (lines > 0) stdout.write(`\x1b[${lines}B`);
      else if (lines < 0) stdout.write(`\x1b[${-lines}A`);
    },
    hideCursor(): void {
      stdout.write("\x1b[?25l");
    },
    showCursor(): void {
      stdout.write("\x1b[?25h");
    },
    clearLine(): void {
      stdout.write("\x1b[K");
    },
    clearFromCursor(): void {
      stdout.write("\x1b[J");
    },
    clearScreen(): void {
      stdout.write("\x1b[2J\x1b[H");
    },
    setTitle(title: string): void {
      stdout.write(`\x1b]0;${title}\x07`);
    },
    setProgress(active: boolean): void {
      stdout.write(active ? PROGRESS_ACTIVE_SEQUENCE : PROGRESS_CLEAR_SEQUENCE);
    },
  };
}

interface ResizeEmitter {
  on(event: "resize", listener: () => void): unknown;
  removeListener(event: "resize", listener: () => void): unknown;
}

function emitsResize(stream: object): stream is ResizeEmitter {
  return "on" in stream && "removeListener" in stream;
}
