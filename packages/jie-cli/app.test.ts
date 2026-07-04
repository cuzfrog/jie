import { JiePlatformError, type AgentIdentity, type JiePlatform } from "@cuzfrog/jie-platform";
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
    continueLast: false,
    ...partial,
  };
}

function makeMockPlatform(overrides: Partial<{
  teamId: string;
  agents: ReadonlyArray<AgentIdentity>;
  execute: JiePlatform["execute"];
}> = {}): JiePlatform {
  return {
    team: {
      id: overrides.teamId ?? "minimal",
      agents: overrides.agents ?? [],
    },
    stop: vi.fn(async () => { }),
    subscribe: vi.fn(() => () => { }),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: overrides.execute ?? vi.fn(async () => null),
  };
}

describe("createApp — guard rails", () => {
  test("empty team guard: platform throws EMPTY_TEAM, createApp returns error code 1 with the message", async () => {
    const createPlatform = vi.fn(async () => {
      throw new JiePlatformError("EMPTY_TEAM", { detail: "team 'empty' has no agents to run; check the team manifest" });
    });
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ teamId: "empty" }),
      createPlatform,
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no agents to run"))).toBe(true);
    writeErr.mockRestore();
  });

  test("no-leader guard: platform throws NO_LEADER, createApp returns error code 1", async () => {
    const createPlatform = vi.fn(async () => {
      throw new JiePlatformError("NO_LEADER", { detail: "team 'lonely' has no leader; check TEAM.md's 'leader:' field" });
    });
    const writeErr = vi.spyOn(console, "error").mockImplementation(() => { });
    const result = await createApp(
      appArgs({ teamId: "lonely" }),
      createPlatform,
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no leader"))).toBe(true);
    writeErr.mockRestore();
  });

  test("happy path: platform returns team with leader, createApp returns ok with leaderKey/agentKeys", async () => {
    const platform = makeMockPlatform({
      teamId: "minimal",
      agents: [
        { teamId: "minimal", role: "general", agentKey: "general-1", isLeader: true },
        { teamId: "minimal", role: "helper", agentKey: "helper-1", isLeader: false },
      ],
    });
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
    const platform = makeMockPlatform({
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
