import xterm, { type IBufferCell, type IBufferLine, type Terminal as XtermTerminalType } from "@xterm/headless";
import type { Terminal } from "@earendil-works/pi-tui";

const XtermTerminal = xterm.Terminal;

export class VirtualTerminal implements Terminal {
  private readonly xterm: XtermTerminalType;
  private inputHandler?: (data: string) => void;
  private resizeHandler?: () => void;
  private _columns: number;
  private _rows: number;

  constructor(columns = 80, rows = 24) {
    this._columns = columns;
    this._rows = rows;
    this.xterm = new XtermTerminal({
      cols: columns,
      rows: rows,
      disableStdin: true,
      allowProposedApi: true,
    });
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.inputHandler = onInput;
    this.resizeHandler = onResize;
    this.xterm.write("\x1b[?2004h");
  }

  async drainInput(_maxMs?: number, _idleMs?: number): Promise<void> {}

  stop(): void {
    this.xterm.write("\x1b[?2004l");
    this.inputHandler = undefined;
    this.resizeHandler = undefined;
  }

  write(data: string): void {
    this.xterm.write(data);
  }

  get columns(): number {
    return this._columns;
  }

  get rows(): number {
    return this._rows;
  }

  get kittyProtocolActive(): boolean {
    return true;
  }

  moveBy(lines: number): void {
    if (lines > 0) this.xterm.write(`\x1b[${lines}B`);
    else if (lines < 0) this.xterm.write(`\x1b[${-lines}A`);
  }

  hideCursor(): void {
    this.xterm.write("\x1b[?25l");
  }

  showCursor(): void {
    this.xterm.write("\x1b[?25h");
  }

  clearLine(): void {
    this.xterm.write("\x1b[K");
  }

  clearFromCursor(): void {
    this.xterm.write("\x1b[J");
  }

  clearScreen(): void {
    this.xterm.write("\x1b[2J\x1b[H");
  }

  setTitle(title: string): void {
    this.xterm.write(`\x1b]0;${title}\x07`);
  }

  setProgress(_active: boolean): void {}

  sendInput(data: string): void {
    if (this.inputHandler !== undefined) this.inputHandler(data);
  }

  resize(columns: number, rows: number): void {
    this._columns = columns;
    this._rows = rows;
    this.xterm.resize(columns, rows);
    if (this.resizeHandler !== undefined) this.resizeHandler();
  }

  async flush(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.xterm.write("", () => resolve());
    });
  }

  async flushAndGetViewport(): Promise<string[]> {
    await this.flush();
    return this.getViewport();
  }

  getViewport(): string[] {
    const lines: string[] = [];
    const buffer = this.xterm.buffer.active;
    for (let i = 0; i < this.xterm.rows; i++) {
      const line = buffer.getLine(buffer.viewportY + i);
      lines.push(line !== undefined ? line.translateToString(true) : "");
    }
    return lines;
  }

  getStyledViewport(): string[] {
    const lines: string[] = [];
    const buffer = this.xterm.buffer.active;
    for (let i = 0; i < this.xterm.rows; i++) {
      const line = buffer.getLine(buffer.viewportY + i);
      lines.push(line === undefined ? "" : styledLine(line));
    }
    return lines;
  }

  getScrollBuffer(): string[] {
    const lines: string[] = [];
    const buffer = this.xterm.buffer.active;
    for (let i = 0; i < buffer.length; i++) {
      const line = buffer.getLine(i);
      lines.push(line !== undefined ? line.translateToString(true) : "");
    }
    return lines;
  }

  clear(): void {
    this.xterm.clear();
  }

  reset(): void {
    this.xterm.reset();
  }

  getCursorPosition(): { x: number; y: number } {
    const buffer = this.xterm.buffer.active;
    return { x: buffer.cursorX, y: buffer.cursorY };
  }

  async waitForRender(): Promise<void> {
    await new Promise<void>((resolve) => process.nextTick(resolve));
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
    await this.flush();
  }
}

function styledLine(line: IBufferLine): string {
  const cell = line.getCell(0);
  if (cell === undefined) return "";
  let out = "";
  let previousSgr: string | null = null;
  for (let x = 0; x < line.length; x++) {
    if (line.getCell(x, cell) === undefined) break;
    if (cell.getWidth() === 0) continue;
    const sgr = foregroundSgr(cell);
    if (sgr !== previousSgr) {
      if (previousSgr !== null) out += "\x1b[39m";
      if (sgr !== null) out += sgr;
      previousSgr = sgr;
    }
    out += cell.getChars();
  }
  if (previousSgr !== null) out += "\x1b[39m";
  return out;
}

function foregroundSgr(cell: IBufferCell): string | null {
  if (cell.isFgDefault()) return null;
  if (cell.isFgPalette()) {
    const color = cell.getFgColor();
    if (color < 8) return `\x1b[${30 + color}m`;
    if (color < 16) return `\x1b[${90 + color - 8}m`;
    return `\x1b[38;5;${color}m`;
  }
  if (cell.isFgRGB()) {
    const color = cell.getFgColor();
    return `\x1b[38;2;${(color >> 16) & 255};${(color >> 8) & 255};${color & 255}m`;
  }
  return null;
}
