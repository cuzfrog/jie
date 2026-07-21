import { PassThrough } from "node:stream";
import { createJiePlatform, type JiePlatform } from "@cuzfrog/jie-platform";
import { createTui, type Tui } from "../tui";
import { VirtualTerminal } from "./virtual-terminal";

export interface HeadlessTui {
  readonly tui: Tui;
  readonly platform: JiePlatform;
  readonly dir: string;
  type(text: string): Promise<void>;
  press(data: string): Promise<void>;
  frame(): Promise<ReadonlyArray<string>>;
  scrollback(): Promise<ReadonlyArray<string>>;
  resize(columns: number, rows: number): Promise<void>;
  settle(ms?: number): Promise<void>;
  errors(): string;
  stop(): Promise<void>;
}

export interface StartHeadlessOptions {
  readonly dir: string;
  readonly cols?: number;
  readonly rows?: number;
  readonly gitBranch?: string;
}

const DEFAULT_COLS = 100;
const DEFAULT_ROWS = 30;
const SETTLE_MS = 250;
const UTF8_LOCALE = "en_US.UTF-8";

class HeadlessStdin extends PassThrough {
  isTTY = true;
  ref(): this { return this; }
  unref(): this { return this; }
  setRawMode(): this { return this; }
  setEncoding(): this { return this; }
}

class HeadlessStdout extends PassThrough {
  columns: number;
  rows: number;
  isTTY = true;

  constructor(columns: number, rows: number) {
    super();
    this.columns = columns;
    this.rows = rows;
  }
}

export async function startHeadlessTui(options: StartHeadlessOptions): Promise<HeadlessTui> {
  const cols = options.cols ?? DEFAULT_COLS;
  const rows = options.rows ?? DEFAULT_ROWS;
  const vt = new VirtualTerminal(cols, rows);
  const stdin = new HeadlessStdin();
  const stdout = new HeadlessStdout(cols, rows);
  stdout.on("data", (chunk: Buffer) => vt.write(chunk.toString("utf8")));
  const stderrChunks: string[] = [];
  const stderr = new PassThrough();
  stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString("utf8")));
  const previousLang = process.env.LANG;
  const previousLangAll = process.env.LC_ALL;
  process.env.LANG = UTF8_LOCALE;
  process.env.LC_ALL = UTF8_LOCALE;
  try {
    const platform = await createJiePlatform({ cwd: options.dir, homeJieDir: options.dir, projectJieDir: options.dir });
    const tui = createTui({ cwd: options.dir, rows }, { platform, stdin, stdout, stderr, gitBranch: options.gitBranch ?? "main" });
    const started = tui.start();
    return {
      tui,
      platform,
      dir: options.dir,
      async type(text: string): Promise<void> {
        for (const char of text) {
          stdin.write(char);
          await nextImmediate();
        }
      },
      async press(data: string): Promise<void> {
        stdin.write(data);
        await nextImmediate();
      },
      async frame(): Promise<ReadonlyArray<string>> {
        await vt.waitForRender();
        return vt.getViewport();
      },
      async scrollback(): Promise<ReadonlyArray<string>> {
        await vt.flush();
        return vt.getScrollBuffer();
      },
      async resize(columns: number, rowsNext: number): Promise<void> {
        stdout.columns = columns;
        stdout.rows = rowsNext;
        vt.resize(columns, rowsNext);
        stdout.emit("resize");
        await vt.waitForRender();
      },
      async settle(ms: number = SETTLE_MS): Promise<void> {
        await sleep(ms);
        await vt.flush();
      },
      errors(): string {
        return stderrChunks.join("");
      },
      async stop(): Promise<void> {
        tui.stop();
        await started;
      },
    };
  } finally {
    restoreLocale(previousLang, previousLangAll);
  }
}

function restoreLocale(previousLang: string | undefined, previousLangAll: string | undefined): void {
  assignOrDeleteEnv("LANG", previousLang);
  assignOrDeleteEnv("LC_ALL", previousLangAll);
}

function assignOrDeleteEnv(key: "LANG" | "LC_ALL", value: string | undefined): void {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function nextImmediate(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
