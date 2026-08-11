import { makeTuiState } from "../../test";
import { ExitCommand } from "./exit-command";
import { makePlatform } from "./_test-fixture";

describe("ExitCommand", () => {
  const command = new ExitCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("exit");
    expect(command.meta.description).toBe("quit jie");
  });

  test("resolve stops the application", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "stop" });
  });

  test("resolve rejects extra arguments", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/exit" });
  });

  test("complete returns null", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("", context)).toBe(null);
  });
});
