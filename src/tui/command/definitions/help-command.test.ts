import { makePlatform, makeTuiState } from "../../test";
import { HelpCommand } from "./help-command";

describe("HelpCommand", () => {
  const command = new HelpCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("help");
    expect(command.meta.description).toBe("show this help");
  });

  test("resolve shows the help panel", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "showHelp" });
  });

  test("resolve rejects extra arguments", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/help" });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});
