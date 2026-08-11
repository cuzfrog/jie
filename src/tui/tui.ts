import { detectCapabilities, setCapabilities, type TUI } from "@earendil-works/pi-tui";
import type { JiePlatform } from "../platform";
import type { TuiRenderer } from "./render";
import type { EffectHandler } from "./state";
import type { ShutdownSignal } from "./shutdown";

export type TuiStdout = NodeJS.WritableStream & { readonly columns?: number; readonly rows?: number };

export interface TuiDeps {
  readonly platform: JiePlatform;
  readonly homeJieDir: string;
  readonly stdin?: NodeJS.ReadableStream;
  readonly stdout?: TuiStdout;
  readonly stderr?: NodeJS.WritableStream;
  readonly gitBranch?: string;
  readonly gitDirty?: boolean;
  readonly version?: string;
}

export interface CreateTUIOptions {
  readonly cwd: string;
  readonly rows?: number;
}

export interface Tui {
  run(): Promise<void>;
}

const MIN_COLS = 60;

export class TuiImpl implements Tui {
  private readonly screen: TUI;
  private readonly renderer: TuiRenderer;
  private readonly shutdownSignal: ShutdownSignal;
  private started = false;

  constructor(screen: TUI, renderer: TuiRenderer, shutdownSignal: ShutdownSignal, effectHandler: EffectHandler) {
    this.screen = screen;
    this.renderer = renderer;
    this.shutdownSignal = shutdownSignal;
    void effectHandler;
  }

  run(): Promise<void> {
    if (this.started) return this.shutdownSignal.stopped;
    const cols = this.screen.terminal.columns;
    if (cols < MIN_COLS) {
      throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${cols}`);
    }
    setCapabilities({ ...detectCapabilities(), hyperlinks: process.env.INK_OSC8 === "1" });
    this.screen.start();
    this.renderer.initialize();
    this.started = true;
    return this.shutdownSignal.stopped;
  }
}
