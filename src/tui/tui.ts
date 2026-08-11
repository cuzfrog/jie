import { detectCapabilities, setCapabilities, type TUI, type Terminal } from "@earendil-works/pi-tui";
import { type JiePlatform } from "../platform";
import { logger } from "../utils";
import type { EffectHandler } from "./state";
import type { TuiView } from "./components";
import type { TuiRenderer } from "./render";

const log = logger.getSubLogger({ name: "jie.tui" });

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
  start(): Promise<void>;
  stop(): void;
}

const MIN_COLS = 60;

export class TuiImpl implements Tui {
  private readonly screen: TUI;
  private readonly terminal: Terminal;
  private readonly view: TuiView;
  private readonly renderer: TuiRenderer;
  private readonly effectHandler: EffectHandler;
  private stopped = false;
  private resolveStart: (() => void) | null = null;
  private unsubscribeKeys: (() => void) | null = null;

  constructor(screen: TUI, terminal: Terminal, view: TuiView, renderer: TuiRenderer, effectHandler: EffectHandler) {
    this.screen = screen;
    this.terminal = terminal;
    this.view = view;
    this.renderer = renderer;
    this.effectHandler = effectHandler;
  }

  start(): Promise<void> {
    return new Promise<void>((resolve) => {
      const cols = this.terminal.columns;
      if (cols < MIN_COLS) {
        throw new Error(`terminal too narrow for TUI; need at least ${MIN_COLS} columns, got ${cols}`);
      }
      this.resolveStart = (): void => {
        this.resolveStart = null;
        resolve();
      };
      try {
        setCapabilities({ ...detectCapabilities(), hyperlinks: process.env.INK_OSC8 === "1" });
        this.renderer.start();
        this.screen.start();
        this.unsubscribeKeys = this.screen.addInputListener((data) => this.view.handleInput(data));
      } catch (error) {
        this.resolveStart = null;
        throw error;
      }
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.unsubscribeKeys?.();
    this.unsubscribeKeys = null;
    this.effectHandler.stop();
    try {
      this.screen.stop();
    } catch {
      log.error("failed to stop tui");
    }
    this.renderer.stop();
    this.resolveStart?.();
  }
}
