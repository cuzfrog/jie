import type { SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { MemoryManager } from "../memory";
import type { ArtifactStore, KanbanStore } from "../storage";
import { createBuiltinTools } from "./builtins";

const eventManager = vi.mocked<EventManager>({ publish: vi.fn(), subscribe: vi.fn() });
const artifactStore = vi.mocked<ArtifactStore>({ write: vi.fn(), read: vi.fn(), list: vi.fn() });
const memoryManager = vi.mocked<MemoryManager>({ add: vi.fn(), search: vi.fn(), bootstrap: vi.fn(() => ""), distill: vi.fn(async () => {}) });
const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  setModelAlias: vi.fn(),
});
const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  setStatus: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
  handoff: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
});

function makeBuiltins() {
  return createBuiltinTools("/tmp", eventManager, artifactStore, memoryManager, settingsStore, kanbanStore);
}

describe("createBuiltinTools", () => {
  test("returns all 18 built-ins with stable registration names", () => {
    const names = makeBuiltins().map((b) => b.name).sort();
    expect(names).toEqual([
      "bash",
      "claim_kanban",
      "edit_file",
      "find_artifact",
      "find_file",
      "grep_file",
      "ls",
      "memory_add",
      "memory_search",
      "notify",
      "read_artifact",
      "read_file",
      "update_kanban",
      "web_fetch",
      "web_search",
      "write_artifact",
      "write_file",
      "write_kanban",
    ]);
  });

  test("every built-in carries a matching tool name, description, and parameter schema", () => {
    for (const { name, tool } of makeBuiltins()) {
      expect(tool.name).toBe(name);
      expect(tool.description).toBeTruthy();
      expect(tool.parameters).toBeDefined();
    }
  });
});
