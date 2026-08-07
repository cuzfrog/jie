import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import type { SettingsStore } from "../config";
import type { EventManager } from "../event";
import type { MemoryStore } from "../memory";
import type { ArtifactStore, KanbanStore } from "../storage";
import { registerToolsModule } from "./module";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const memoryStore = vi.mocked<MemoryStore>({ add: vi.fn(), search: vi.fn(), top: vi.fn() });

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
});

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
});

function bootedContainer(): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue("/tmp"),
    eventManager: asValue(eventManager),
    artifactStore: asValue(artifactStore),
    memoryStore: asValue(memoryStore),
    settingsStore: asValue(settingsStore),
    kanbanStore: asValue(kanbanStore),
  });
  registerToolsModule(container);
  return container;
}

describe("registerToolsModule", () => {
  test("toolRegistry resolves with the 11 built-ins installed", () => {
    const container = bootedContainer();
    const names = container.cradle.toolRegistry.list().map((t) => t.name).sort();
    expect(names).toEqual([
      "bash",
      "edit_file",
      "kanban_write",
      "memory_search",
      "notify",
      "read_artifact",
      "read_file",
      "web_fetch",
      "web_search",
      "write_artifact",
      "write_file",
    ]);
  });

  test("registers a singleton", () => {
    const container = bootedContainer();
    expect(container.cradle.toolRegistry).toBe(container.resolve("toolRegistry"));
  });
});
