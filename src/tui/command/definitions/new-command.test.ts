import { makePlatform, makeTuiState, teamState } from "../../test";
import { NewCommand } from "./new-command";

describe("NewCommand", () => {
  const command = new NewCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("new");
    expect(command.meta.description).toBe("start a new session");
    expect(command.meta.aliases).toBeUndefined();
  });

  test("resolve builds the newSession platform command when a team is loaded", () => {
    const { platform } = makePlatform();
    const context = { state: teamState("my-team"), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "platform", slashName: "new", command: { name: "newSession", teamId: "my-team" }, transient: "starting new session" });
  });

  test("resolve rejects when no team is loaded", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/new: no team loaded" });
  });

  test("resolve rejects extra arguments", () => {
    const { platform } = makePlatform();
    const context = { state: teamState("my-team"), platform };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/new: takes no arguments" });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});
