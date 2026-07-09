import { PassThrough } from "node:stream";
import { createTui, type Tui } from "./tui";
import { Actions } from "./state";
import { withTTY } from "../../tests/support";
import type { JiePlatform, EventType, AnyEventEnvelope, EventEnvelope } from "@cuzfrog/jie-platform";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

class FakeStdin extends PassThrough {
  isTTY = true;
  ref(): this { return this; }
  unref(): this { return this; }
  setRawMode(): this { return this; }
  setEncoding(): this { return this; }
  resume(): this { super.resume(); return this; }
  pause(): this { super.pause(); return this; }
}

class FakeStdout extends PassThrough {
  columns = 80;
  rows = 30;
}

function bootTui(): Tui {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  return createTui({ cwd: process.cwd() }, {
    platform: makePlatform(),
    stdin: stdin as unknown as NodeJS.ReadStream,
    stdout: stdout as unknown as NodeJS.WriteStream,
  });
}

function makePlatform(): JiePlatform {
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

describe("createTui — start resolves on pendingQuit", () => {
  test("dispatching requestQuit resolves start()", async () => {
    withTTY(true, async () => {
      const tui = bootTui();
      const stateStore = (tui as unknown as { stateStore: { getState: () => { pendingQuit: boolean }; dispatch: (a: unknown) => void } }).stateStore;
      const started = tui.start();
      await new Promise((r) => setTimeout(r, 30));
      stateStore.dispatch(Actions.requestQuit());
      expect(stateStore.getState().pendingQuit).toBe(true);
      await Promise.race([
        started,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("start did not resolve within 2s after requestQuit")), 2000)),
      ]);
      tui.stop();
    });
  });

  test("stop() resolves start() even without requestQuit", async () => {
    withTTY(true, async () => {
      const tui = bootTui();
      const started = tui.start();
      await new Promise((r) => setTimeout(r, 30));
      tui.stop();
      await Promise.race([
        started,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("stop did not resolve within 2s")), 2000)),
      ]);
    });
  });
});

describe("createTui — surface contract", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui({ cwd: process.cwd() }, { platform: makePlatform() })).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with initial empty state", () => {
    withTTY(true, () => {
      const platform = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform });
      const s0 = tui.state;
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});
