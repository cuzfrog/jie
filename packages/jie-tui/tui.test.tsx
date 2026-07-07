import { createTui, type Tui } from "./tui";
import { makePlatform } from "./test-harness";
import { withTTY } from "../../tests/support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

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