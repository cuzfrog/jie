import { createTui, type CreateTUIOptions, type Tui } from "./tui";
import { createEventManager, type EventManager } from "@cuzfrog/jie-platform/event";
import { withTTY } from "../../tests/support";

function makeStubBus(): EventManager {
  return createEventManager();
}

function makeOptions(overrides: Partial<CreateTUIOptions> = {}): CreateTUIOptions {
  return {
    bus: makeStubBus(),
    artifacts: {
      write: async () => ({ key: "", created_at: "" }),
      read: async () => null,
      list: async () => [],
    },
    roles: [],
    cols: 80,
    ...overrides,
  };
}

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