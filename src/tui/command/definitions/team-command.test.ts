import { makePlatform, makeTuiState } from "../../test";
import { TeamCommand } from "./team-command";

describe("TeamCommand", () => {
  const command = new TeamCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("team");
    expect(command.meta.description).toBe("switch the active team");
    expect(command.meta.argumentHint).toBe("<teamId>");
  });

  test("resolve requires a team id", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/team <teamId>" });
  });

  test("resolve builds the team command", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["alpha"])).toEqual({
      kind: "platform",
      slashName: "team",
      command: { name: "team", teamId: "alpha" },
      transient: "loading team 'alpha'",
    });
  });

  test("complete returns installed teams with the default marker", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
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
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "alpha", label: "alpha", description: "1 agent (default)" },
        { value: "beta", label: "beta", description: "3 agents" },
      ],
    });
  });

  test("complete includes the agent count and description", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getTeamInfo") {
        return {
          defaultTeam: null,
          installed: [{ id: "alpha", agentCount: 2, location: "user" as const, description: "Alpha team" }],
        };
      }
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "alpha", label: "alpha", description: "2 agents · Alpha team" }],
    });
  });

  test("complete marks a single-agent team with a singular label", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getTeamInfo") {
        return {
          defaultTeam: null,
          installed: [{ id: "alpha", agentCount: 1, location: "user" as const }],
        };
      }
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "alpha", label: "alpha", description: "1 agent" }],
    });
  });
});
