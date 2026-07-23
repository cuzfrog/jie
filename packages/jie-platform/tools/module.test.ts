import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import type { EventManager } from "../event";
import type { ArtifactStore } from "../storage";
import { registerToolsModule } from "./module";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
  subscriberCount: vi.fn(),
});

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

function bootedContainer(): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue("/tmp"),
    eventManager: asValue(eventManager),
    artifactStore: asValue(artifactStore),
  });
  registerToolsModule(container);
  return container;
}

describe("registerToolsModule", () => {
  test("toolRegistry resolves with the 10 built-ins installed", () => {
    const container = bootedContainer();
    const names = container.cradle.toolRegistry.list().map((t) => t.name).sort();
    expect(names).toEqual([
      "bash",
      "edit",
      "notify",
      "read_artifact",
      "read_file",
      "todo_write",
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
