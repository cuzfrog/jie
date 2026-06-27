
import {
  createModelRegistry,
  type AuthStore,
  type SettingsStore,
} from "@cuzfrog/jie-platform/config";
import { createEventManager } from "@cuzfrog/jie-platform/event";
import {
  createArtifactStore,
  createMemoryManager,
  createStorage,
} from "@cuzfrog/jie-platform/storage";
import { type TeamRegistry } from "@cuzfrog/jie-platform/team";
import { createToolRegistry } from "@cuzfrog/jie-platform/tools";
import { join } from "node:path";
import { createApp, type AppArgs, type AppDeps } from "./app.ts";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  write: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const teamRegistry = vi.mocked<TeamRegistry>({
  loadTeam: vi.fn(),
  isInstalled: vi.fn(),
  listInstalled: vi.fn(),
  locate: vi.fn(),
});

function makeDeps(workspace: string, homeJieDir: string): AppDeps {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  const projectJieDir = join(workspace, ".jie");
  const events = createEventManager();
  const artifactStore = createArtifactStore(storage);

  return {
    authStore,
    settingsStore,
    eventManager: events,
    storage,
    teamRegistry,
    modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
    toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events, artifactStore }),
    artifactStore,
    memoryManager: createMemoryManager(storage),
  };
}

function appArgs(partial: Partial<AppArgs> = {}): AppArgs {
  return {
    kind: "print",
    cwd: "/tmp/workspace",
    homeJieDir: "/tmp/home/.jie",
    projectJieDir: null,
    teamId: undefined,
    apiKey: undefined,
    resume: undefined,
    continueLast: false,
    ...partial,
  };
}

describe("createApp — guard rails", () => {
  beforeEach(() => {
    settingsStore.load.mockReturnValue({});
  });

  test("--api-key without defaultProvider: returns error code 1, no auth.json written", async () => {
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ cwd: "/tmp/workspace", homeJieDir: "/tmp/home/.jie", apiKey: "sk-test" }),
      makeDeps("/tmp/workspace", "/tmp/home/.jie"),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no provider resolved"))).toBe(true);
    writeErr.mockRestore();
  });

  test("--team <id> not installed: returns error code 1 with team-not-found message", async () => {
    teamRegistry.loadTeam.mockImplementationOnce(() => {
      throw new Error("team 'ghost' not found");
    });
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ cwd: "/tmp/workspace", homeJieDir: "/tmp/home/.jie", teamId: "ghost" }),
      makeDeps("/tmp/workspace", "/tmp/home/.jie"),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("team 'ghost' not found"))).toBe(true);
    writeErr.mockRestore();
  });

  test("empty team (TEAM.md, no agent .md files) guard: returns error code 1 with no-agents message", async () => {
    const emptyTeam = {
      id: "empty",
      leaderRole: "general",
      roles: [],
    };
    teamRegistry.loadTeam.mockReturnValue(emptyTeam);
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ cwd: "/tmp/workspace", homeJieDir: "/tmp/home/.jie", teamId: "empty" }),
      makeDeps("/tmp/workspace", "/tmp/home/.jie"),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no agents to run"))).toBe(true);
    writeErr.mockRestore();
  });
});
