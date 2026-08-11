import { makePlatform, makeTuiState, teamState } from "../../test";
import { RenameCommand } from "./rename-command";

describe("RenameCommand", () => {
  const command = new RenameCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("rename");
    expect(command.meta.description).toBe("name the active session");
    expect(command.meta.argumentHint).toBe("<name>");
  });

  test("resolve requires a loaded team", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["new name"])).toEqual({ kind: "error", text: "/rename: no team loaded" });
  });

  test("resolve requires a name", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/rename <name>" });
  });

  test("resolve joins multi-word names and builds the rename command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, ["my", "session", "name"])).toEqual({
      kind: "platform",
      slashName: "rename",
      command: { name: "renameSession", teamId: "t1", sessionName: "my session name" },
      transient: "session renamed to my session name",
    });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});
