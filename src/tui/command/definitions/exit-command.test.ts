import { makePlatform, makeTuiState } from "../../test";
import { ExitCommand } from "./exit-command";

describe("ExitCommand", () => {
  const command = new ExitCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("exit");
    expect(command.meta.description).toBe("quit jie");
  });

  test("resolve stops the application", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "stop" });
  });

  test("resolve rejects extra arguments", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/exit" });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});
