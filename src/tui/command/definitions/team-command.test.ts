import { makeTuiState } from "../../test";
import { TeamCommand } from "./team-command";
import { makePlatform } from "./_test-fixture";

describe("TeamCommand", () => {
  const command = new TeamCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("team");
    expect(command.meta.description).toBe("switch the active team");
    expect(command.meta.argumentHint).toBe("<teamId>");
  });

  test("resolve requires a team id", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/team <teamId>" });
  });

  test("resolve builds the team command", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["alpha"])).toEqual({
      kind: "platform",
      slashName: "team",
      command: { name: "team", teamId: "alpha" },
      transient: "loading team 'alpha'",
    });
  });

  test("complete returns installed teams with the default marker", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        if (cmd.name === "getTeamInfo") {
          return {
            defaultTeam: "alpha",
            installed: [
              { id: "alpha", agentCount: 1, location: "user" as const },
              { id: "beta", agentCount: 3, location: "user" as const },
            ],
          };
        }
        return null;
      }),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "alpha", label: "alpha", description: "(default)" },
        { value: "beta", label: "beta", description: "3 agents" },
      ],
    });
  });

  test("complete marks a single-agent team with a singular label", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        if (cmd.name === "getTeamInfo") {
          return {
            defaultTeam: null,
            installed: [{ id: "alpha", agentCount: 1, location: "user" as const }],
          };
        }
        return null;
      }),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "alpha", label: "alpha", description: "1 agent" }],
    });
  });
});
