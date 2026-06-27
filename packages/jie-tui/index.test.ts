import { describe, expect, test } from "bun:test";
import { startTUI, type StartTUIOptions } from ".";
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
    write: async () => {},
    read: async () => null,
    list: async () => [],
  } as unknown as ArtifactStore;
}

function makeOptions(overrides: Partial<StartTUIOptions> = {}): StartTUIOptions {
  return {
    bus: makeStubBus(),
    artifacts: makeStubArtifacts(),
    roles: [],
    ...overrides,
  };
}

describe("startTUI — v1 stub contract", () => {
  test("throws with the documented v1 message", () => {
    let caught: unknown;
    try {
      startTUI(makeOptions());
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("TUI not implemented in v1 MVP");
  });

  test("throws even when roles is non-empty (stub ignores options)", () => {
    let caught: unknown;
    try {
      startTUI(makeOptions({ roles: ["leader", "researcher"] }));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe("TUI not implemented in v1 MVP");
  });
});