import { StdinBuffer, type Terminal } from "@earendil-works/pi-tui";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const STDIN_BUFFER_TIMEOUT_MS = 10;

const PROGRESS_ACTIVE_SEQUENCE = "\x1b]9;4;3\x07";
const PROGRESS_CLEAR_SEQUENCE = "\x1b]9;4;0;\x07";

export class StreamTerminalImpl implements Terminal {
  private readonly stdin: NodeJS.ReadableStream;
  private readonly stdout: NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number };
  private onInput: ((data: string) => void) | null = null;
  private buffer: StdinBuffer | null = null;
  private dataHandler: ((chunk: Buffer) => void) | null = null;
  private resizeEmitter: ResizeEmitter | null = null;
  private resizeHandler: (() => void) | null = null;

  constructor(stdin: NodeJS.ReadableStream, stdout: NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number }) {
    this.stdin = stdin;
    this.stdout = stdout;
  }

  get columns(): number {
    return this.stdout.columns ?? DEFAULT_COLUMNS;
  }

  get rows(): number {
    return this.stdout.rows ?? DEFAULT_ROWS;
  }

  get kittyProtocolActive(): boolean {
    return false;
  }

  start(inputHandler: (data: string) => void, onResize: () => void): void {
    this.onInput = inputHandler;
    this.resizeHandler = onResize;
    this.buffer = new StdinBuffer({ timeout: STDIN_BUFFER_TIMEOUT_MS });
    this.buffer.on("data", this.forward);
    this.buffer.on("paste", (content) => this.forward(`\x1b[200~${content}\x1b[201~`));
    this.dataHandler = (chunk: Buffer): void => {
      this.buffer?.process(chunk.toString());
    };
    this.stdin.on("data", this.dataHandler);
    if (emitsResize(this.stdout)) {
      this.resizeEmitter = this.stdout;
      this.resizeEmitter.on("resize", onResize);
    }
  }

  stop(): void {
    if (this.dataHandler !== null) {
      this.stdin.removeListener("data", this.dataHandler);
      this.dataHandler = null;
    }
    if (this.resizeEmitter !== null && this.resizeHandler !== null) {
      this.resizeEmitter.removeListener("resize", this.resizeHandler);
      this.resizeEmitter = null;
    }
    this.resizeHandler = null;
    this.buffer?.destroy();
    this.buffer = null;
    this.onInput = null;
  }

  drainInput(): Promise<void> {
    const flushed = this.buffer?.flush() ?? [];
    for (const sequence of flushed) this.forward(sequence);
    return Promise.resolve();
  }

  write(data: string): void {
    this.stdout.write(data);
  }

  moveBy(lines: number): void {
    if (lines > 0) this.stdout.write(`\x1b[${lines}B`);
    else if (lines < 0) this.stdout.write(`\x1b[${-lines}A`);
  }

  hideCursor(): void {
    this.stdout.write("\x1b[?25l");
  }

  showCursor(): void {
    this.stdout.write("\x1b[?25h");
  }

  clearLine(): void {
    this.stdout.write("\x1b[K");
  }

  clearFromCursor(): void {
    this.stdout.write("\x1b[J");
  }

  clearScreen(): void {
    this.stdout.write("\x1b[2J\x1b[H");
  }

  setTitle(title: string): void {
    this.stdout.write(`\x1b]0;${title}\x07`);
  }

  setProgress(active: boolean): void {
    this.stdout.write(active ? PROGRESS_ACTIVE_SEQUENCE : PROGRESS_CLEAR_SEQUENCE);
  }

  private forward = (sequence: string): void => {
    this.onInput?.(sequence);
  };
}

interface ResizeEmitter {
  on(event: "resize", listener: () => void): unknown;
  removeListener(event: "resize", listener: () => void): unknown;
}

function emitsResize(stream: object): stream is ResizeEmitter {
  return "on" in stream && "removeListener" in stream;
}
