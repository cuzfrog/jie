import { EFFORT_LEVELS } from "../../../platform";
import { makeTuiState } from "../../test";
import { EffortCommand } from "./effort-command";
import { makePlatform } from "./_test-fixture";

describe("EffortCommand", () => {
  const command = new EffortCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("effort");
    expect(command.meta.description).toBe("set the thinking effort");
    expect(command.meta.argumentHint).toBe("<level>");
  });

  test("resolve queries the current default effort when no level is given", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "getDefaultEffort" ? "low" : null)),
    };
    const result = await command.resolve(context, []);
    expect(result).toEqual({ kind: "reply", text: "default effort: low" });
  });

  test("resolve rejects an invalid effort level", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["extreme"])).toEqual({ kind: "error", text: "/effort: invalid 'extreme' (expected off | low | medium | high | max)" });
  });

  test("resolve sets the default effort level", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["medium"])).toEqual({
      kind: "platform",
      slashName: "effort",
      command: { name: "setDefaultEffort", effort: "medium" },
      transient: "effort set to medium",
    });
  });

  test("complete returns effort levels", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    const result = await command.complete("", context);
    expect(result).not.toBe(null);
    expect(result!.items.map((item) => item.value)).toEqual([...EFFORT_LEVELS]);
  });

  test("complete suppresses an exact match", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("medium", context)).toBe(null);
  });
});
