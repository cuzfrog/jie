import { makeTuiState } from "../../test";
import { HelpCommand } from "./help-command";
import { makePlatform } from "./_test-fixture";

describe("HelpCommand", () => {
  const command = new HelpCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("help");
    expect(command.meta.description).toBe("show this help");
  });

  test("resolve shows the help panel", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "showHelp" });
  });

  test("resolve rejects extra arguments", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/help" });
  });

  test("complete returns null", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("", context)).toBe(null);
  });
});
