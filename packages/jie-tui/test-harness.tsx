import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { render as inkRender } from "ink";
import { type AnyEventEnvelope, type EventEnvelope, type EventType, type JiePlatform } from "@cuzfrog/jie-platform";
import { TuiState, createStateStore, type StateStore } from "./state";
import { type TuiContextValue } from "./components";

export class ReadableStdin extends EventEmitter {
  isTTY = true;
  private buffer: string | null = null;
  write(data: string): void {
    this.buffer = data;
    this.emit("readable");
  }
  read(): string | null {
    const data = this.buffer;
    this.buffer = null;
    return data;
  }
  setEncoding(): void {}
  setRawMode(): void {}
  resume(): void {}
  pause(): void {}
  ref(): void {}
  unref(): void {}
}

export interface RenderHarness {
  readonly stdin: ReadableStdin;
  readonly frames: ReadonlyArray<string>;
  lastFrame(): string;
  unmount(): void;
}

export function renderComponent(tree: Parameters<typeof inkRender>[0]): RenderHarness {
  const stdin = new ReadableStdin();
  const stdout = new PassThrough() as PassThrough & { columns: number; rows: number };
  stdout.columns = 100;
  stdout.rows = 30;
  const frames: string[] = [];
  const origWrite = stdout.write.bind(stdout);
  (stdout as unknown as { write: (chunk: string | Uint8Array) => boolean }).write = (chunk: string | Uint8Array): boolean => {
    const text = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    frames.push(text);
    return origWrite(chunk);
  };
  const instance = inkRender(tree, {
    stdout: stdout as unknown as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    exitOnCtrlC: false,
    patchConsole: false,
    debug: true,
  });
  return {
    stdin,
    get frames(): ReadonlyArray<string> { return frames; },
    lastFrame(): string {
      return frames[frames.length - 1] ?? "";
    },
    unmount(): void {
      instance.unmount();
    },
  };
}

export interface ContextOverrides {
  readonly stateStore?: StateStore;
  readonly state?: TuiContextValue["state"];
  readonly focusedAgent?: TuiContextValue["focusedAgent"];
  readonly thinkingExpanded?: boolean;
  readonly toolCardsExpanded?: boolean;
  readonly dispatch?: TuiContextValue["dispatch"];
  readonly setThinkingExpanded?: TuiContextValue["setThinkingExpanded"];
  readonly setToolCardsExpanded?: TuiContextValue["setToolCardsExpanded"];
}

export function makeContextValue(overrides: ContextOverrides = {}): TuiContextValue {
  const stateStore = overrides.stateStore ?? createStateStore();
  const state = overrides.state ?? stateStore.getState();
  const focusedAgent = overrides.focusedAgent ?? TuiState.getFocusedAgent(state);
  return {
    state,
    dispatch: overrides.dispatch ?? ((action) => stateStore.dispatch(action)),
    focusedAgent,
    thinkingExpanded: overrides.thinkingExpanded ?? false,
    toolCardsExpanded: overrides.toolCardsExpanded ?? false,
    setThinkingExpanded: overrides.setThinkingExpanded ?? ((): void => undefined),
    setToolCardsExpanded: overrides.setToolCardsExpanded ?? ((): void => undefined),
  };
}

export function makePlatform(): JiePlatform {
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  return {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as (env: AnyEventEnvelope) => void;
      handlers.set(topic, handler);
      return () => {
        if (handlers.get(topic) === handler) handlers.delete(topic);
      };
    },
    prompt: () => undefined,
    interrupt: () => undefined,
    execute: (async () => null) as JiePlatform["execute"],
    loadedTeams: () => [],
  };
}
