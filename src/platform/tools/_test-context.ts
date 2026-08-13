import type { ArtifactStore } from "../storage";
import type { AgentDispatcher } from "../types";
import type { ExecutionContext } from "./types";

export function makeEmptyContext(): ExecutionContext {
  const artifactStore: ArtifactStore = {
    write: async () => ({ key: "", created_at: "" }),
    read: async () => null,
    list: async () => [],
  };
  return {
    sessionId: "test-session",
    teamId: "test-team",
    agentKey: "general-1",
    agentRole: "general",
    artifactStore,
    toolArgs: new Map(),
    agentDispatcher: { call: vi.fn() } as AgentDispatcher,
  };
}
