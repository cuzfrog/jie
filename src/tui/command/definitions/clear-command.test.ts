import { makePlatform, makeTuiState } from "../../test";
import { ClearCommand } from "./clear-command";

describe("ClearCommand", () => {
  const command = new ClearCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("clear");
    expect(command.meta.description).toBe("clear the conversation");
    expect(command.meta.aliases).toEqual(["new"]);
  });

  test("resolve clears the UI state", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "ui", action: "clearState" });
  });

  test("resolve rejects extra arguments", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["extra"])).toEqual({ kind: "error", text: "/clear" });
  });

  test("complete returns null", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("", context)).toBe(null);
  });
});
