import { createTui, type CreateTUIOptions, type Tui } from "./tui";
import { createEventManager, type EventManager } from "@cuzfrog/jie-platform/event";
import type { ArtifactStore } from "@cuzfrog/jie-platform/storage";

function makeStubBus(): EventManager {
  return createEventManager();
}

function makeStubArtifacts(): ArtifactStore {
  return {
    write: async () => ({ key: "", created_at: "" }),
    read: async () => null,
    list: async () => [],
  };
}

function makeOptions(overrides: Partial<CreateTUIOptions> = {}): CreateTUIOptions {
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

describe("createTui — v0.2 surface", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui(makeOptions())).toThrow(/interactive terminal/);
    });
  });

  test("throws when terminal is too narrow", () => {
    withTTY(true, () => {
      expect(() => createTui(makeOptions({ cols: 40 }))).toThrow(/too narrow/);
    });
  });

  test("returns a Tui handle with the contract methods", () => {
    withTTY(true, () => {
      const tui: Tui = createTui(makeOptions());
      const s0 = tui.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});