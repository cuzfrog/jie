import { JiePlatformError, type AgentIdentity, type JiePlatform, type Settings, type TeamIdentity } from "@cuzfrog/jie-platform";
import { createApp, type AppArgs } from "./app";

function appArgs(partial: Partial<AppArgs> = {}): AppArgs {
  return {
    kind: "print",
    cwd: "/tmp/workspace",
    homeJieDir: "/tmp/home/.jie",
    projectJieDir: null,
    teamId: undefined,
    apiKey: undefined,
    resume: undefined,
    ...partial,
  };
}

function makeMockPlatform(teams: ReadonlyMap<string, TeamIdentity>, overrides: Partial<{
  execute: JiePlatform["execute"];
  settings: Settings;
}> = {}): JiePlatform {
  return {
    teams,
    settings: overrides.settings ?? {},
    start: vi.fn(async () => { }),
    stop: vi.fn(async () => { }),
    subscribe: vi.fn(() => () => { }),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: overrides.execute ?? vi.fn(async () => null),
  };
}

function makeAgents(items: ReadonlyArray<{ role: string; isLeader?: boolean }>): ReadonlyArray<AgentIdentity> {
  return items.map((i, idx) => ({
    teamId: "minimal",
    role: i.role,
    agentKey: `${i.role}-1`,
    isLeader: i.isLeader ?? idx === 0,
  }));
}

describe("createApp — guard rails", () => {
  test("requested team is missing and no minimal fallback: returns error code 1", async () => {
    const teams = new Map<string, TeamIdentity>([
      ["ghost", { id: "ghost", agents: makeAgents([{ role: "general" }]) }],
    ]);
    const platform = makeMockPlatform(teams);
    const createPlatform = vi.fn(async () => platform);
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ teamId: "empty" }),
      createPlatform,
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    expect(writeErr).toHaveBeenCalled();
    writeErr.mockRestore();
  });

  test("requested team missing: returns error code 1, even when minimal fallback exists", async () => {
    const teams = new Map<string, TeamIdentity>([
      ["minimal", { id: "minimal", agents: makeAgents([{ role: "general" }]) }],
    ]);
    const platform = makeMockPlatform(teams, { settings: { defaultTeam: "minimal" } });
    const createPlatform = vi.fn(async () => platform);
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ teamId: "missing" }),
      createPlatform,
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    expect(writeErr).toHaveBeenCalled();
    writeErr.mockRestore();
  });

  test("leader-less team throws NO_LEADER on createApp", async () => {
    const lonely = makeAgents([]);
    const teams = new Map<string, TeamIdentity>([
      ["minimal", { id: "minimal", agents: lonely }],
    ]);
    const platform = makeMockPlatform(teams);
    const createPlatform = vi.fn(async () => platform);
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(appArgs(), createPlatform);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    expect(writeErr).toHaveBeenCalled();
    writeErr.mockRestore();
  });

  test("happy path: platform returns team with leader, createApp returns ok with leaderKey/agentKeys", async () => {
    const teams = new Map<string, TeamIdentity>([
      ["minimal", {
        id: "minimal",
        agents: makeAgents([
          { role: "general", isLeader: true },
          { role: "helper", isLeader: false },
        ]),
      }],
    ]);
    const platform = makeMockPlatform(teams, { settings: { defaultTeam: "minimal" } });
    const createPlatform = vi.fn(async () => platform);
    const result = await createApp(appArgs(), createPlatform);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.app.teamId).toBe("minimal");
      expect(result.app.leaderKey).toBe("general-1");
      expect(result.app.agentKeys).toEqual(["general-1", "helper-1"]);
    }
  });

  test("apiKey: setApiKey NO_DEFAULT_PROVIDER surfaces friendly error and stops platform", async () => {
    const teams = new Map<string, TeamIdentity>([
      ["minimal", { id: "minimal", agents: makeAgents([{ role: "general" }]) }],
    ]);
    const platform = makeMockPlatform(teams, {
      execute: vi.fn(async () => {
        throw new JiePlatformError("NO_DEFAULT_PROVIDER", {
          detail: "run 'jie model <provider>/<modelId>' first, or use 'jie login --provider <id> --api-key <key>'",
        });
      }),
    });
    const createPlatform = vi.fn(async () => platform);
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(appArgs({ apiKey: "sk-test" }), createPlatform);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    expect(platform.stop).toHaveBeenCalledTimes(1);
    expect(writeErr).toHaveBeenCalled();
    writeErr.mockRestore();
  });
});
