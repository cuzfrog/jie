import { makePlatform, makeTuiState, teamState } from "../../test";
import { ReloadCommand } from "./reload-command";

describe("ReloadCommand", () => {
  const command = new ReloadCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("reload");
    expect(command.meta.description).toBe("reload settings, manifests, and context files");
  });

  test("resolve rejects while any agent is busy", () => {
    const { platform } = makePlatform();
    const context = { state: teamState("t1", "busy"), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "wait for the current response to finish before reloading" });
  });

  test("resolve builds the reload command", () => {
    const { platform } = makePlatform();
    const context = { state: teamState(), platform };
    expect(command.resolve(context, [])).toEqual({
      kind: "platform",
      slashName: "reload",
      command: { name: "reload" },
      transient: "reloaded settings, manifests, and context files",
    });
  });

  test("resolve rejects extra arguments", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/reload" });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});
