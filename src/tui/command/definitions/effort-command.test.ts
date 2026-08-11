import { EFFORT_LEVELS } from "../../../platform";
import { makePlatform, makeTuiState } from "../../test";
import { EffortCommand } from "./effort-command";

describe("EffortCommand", () => {
  const command = new EffortCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("effort");
    expect(command.meta.description).toBe("set the thinking effort");
    expect(command.meta.argumentHint).toBe("<level>");
  });

  test("resolve queries the current default effort when no level is given", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getDefaultEffort") return "low";
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, []);
    expect(result).toEqual({ kind: "reply", text: "default effort: low" });
  });

  test("resolve rejects an invalid effort level", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["extreme"])).toEqual({ kind: "error", text: "/effort: invalid 'extreme' (expected off | low | medium | high | max)" });
  });

  test("resolve sets the default effort level", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["medium"])).toEqual({
      kind: "platform",
      slashName: "effort",
      command: { name: "setDefaultEffort", effort: "medium" },
      transient: "effort set to medium",
    });
  });

  test("complete returns effort levels", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("", context);
    expect(result).not.toBe(null);
    expect(result!.items.map((item) => item.value)).toEqual([...EFFORT_LEVELS]);
  });

  test("complete suppresses an exact match", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("medium", context)).toBe(null);
  });
});
