import { makeTuiState } from "../../test";
import { ReloadCommand } from "./reload-command";
import { makePlatform, teamState } from "./_test-fixture";

describe("ReloadCommand", () => {
  const command = new ReloadCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("reload");
    expect(command.meta.description).toBe("reload settings, manifests, and context files");
  });

  test("resolve rejects while any agent is busy", () => {
    const context = { state: teamState("t1", "busy"), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "wait for the current response to finish before reloading" });
  });

  test("resolve builds the reload command", () => {
    const context = { state: teamState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({
      kind: "platform",
      slashName: "reload",
      command: { name: "reload" },
      transient: "reloaded settings, manifests, and context files",
    });
  });

  test("resolve rejects extra arguments", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/reload" });
  });

  test("complete returns null", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("", context)).toBe(null);
  });
});
