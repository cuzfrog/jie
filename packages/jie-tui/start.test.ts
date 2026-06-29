import { startTUI, type StartTUIOptions, type Tui } from ".";
import type { EventManager } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";

function makeStubBus(): EventManager {
  return {
    publish: () => {},
    subscribe: () => () => {},
    subscriberCount: () => 0,
  } as unknown as EventManager;
}

function makeStubArtifacts(): ArtifactStore {
  return {
    write: async () => ({ key: "", created_at: "" }),
    read: async () => null,
    list: async () => [],
  } as unknown as ArtifactStore;
}

function makeOptions(overrides: Partial<StartTUIOptions> = {}): StartTUIOptions {
  return {
    bus: makeStubBus(),
    artifacts: makeStubArtifacts(),
    roles: [],
    cols: 80,
    ...overrides,
  };
}

const withTTY = (value: boolean, action: () => void): void => {
  const original = process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", { value, configurable: true });
  try {
    action();
  } finally {
    Object.defineProperty(process.stdin, "isTTY", { value: original, configurable: true });
  }
};

describe("startTUI — v0.2 surface", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      let caught: unknown;
      try {
        startTUI(makeOptions());
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/interactive terminal/);
    });
  });

  test("throws when terminal is too narrow", () => {
    withTTY(true, () => {
      let caught: unknown;
      try {
        startTUI(makeOptions({ cols: 40 }));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(Error);
      expect((caught as Error).message).toMatch(/too narrow/);
    });
  });

  test("returns a Tui handle with the four contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = startTUI(makeOptions());
      expect(typeof tui.getState).toBe("function");
      expect(typeof tui.submit).toBe("function");
      expect(typeof tui.injectKey).toBe("function");
      expect(typeof tui.stop).toBe("function");
      const s0 = tui.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});