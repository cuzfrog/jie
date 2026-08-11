import { makeTuiState } from "../../test";
import { ClearCommand } from "./clear-command";
import { makePlatform } from "./_test-fixture";

describe("ClearCommand", () => {
  const command = new ClearCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("clear");
    expect(command.meta.description).toBe("clear the conversation");
    expect(command.meta.aliases).toEqual(["new"]);
  });

  test("resolve clears the UI state", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "clearState" });
  });

  test("resolve rejects extra arguments", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/clear" });
  });

  test("complete returns null", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("", context)).toBe(null);
  });
});
