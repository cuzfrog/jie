import { makePlatform, makeTuiState } from "../../test";
import { SettingCommand } from "./setting-command";

describe("SettingCommand", () => {
  const command = new SettingCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("setting");
    expect(command.meta.description).toBe("configure display settings");
    expect(command.meta.argumentHint).toBe("<diff-block-expand|thinking-block-expand> <on|off>");
  });

  test("resolve enables diff block expansion", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["diff-block-expand", "on"])).toEqual({
      kind: "set",
      key: "toolCardsExpanded",
      value: true,
    });
  });

  test("resolve disables diff block expansion", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["diff-block-expand", "off"])).toEqual({
      kind: "set",
      key: "toolCardsExpanded",
      value: false,
    });
  });

  test("resolve enables thinking block expansion", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["thinking-block-expand", "on"])).toEqual({
      kind: "set",
      key: "thinkingExpanded",
      value: true,
    });
  });

  test("resolve with an unknown key reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["unknown", "on"])).toEqual({
      kind: "error",
      text: "/setting <diff-block-expand|thinking-block-expand> <on|off>",
    });
  });

  test("resolve with an invalid value reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["diff-block-expand", "maybe"])).toEqual({
      kind: "error",
      text: "/setting <diff-block-expand|thinking-block-expand> <on|off>",
    });
  });

  test("resolve with missing arguments reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["diff-block-expand"])).toEqual({
      kind: "error",
      text: "/setting <diff-block-expand|thinking-block-expand> <on|off>",
    });
  });

  test("complete returns the setting names with current status", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ toolCardsExpanded: true }), platform };
    expect(command.complete("", context)).toEqual({
      items: [
        { value: "diff-block-expand", label: "diff-block-expand", description: "current: on" },
        { value: "thinking-block-expand", label: "thinking-block-expand", description: "current: off" },
      ],
    });
  });

  test("complete filters setting names by substring", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("thin", context)).toEqual({
      items: [{ value: "thinking-block-expand", label: "thinking-block-expand", description: "current: off" }],
    });
  });

  test("complete returns on and off with current status", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ thinkingExpanded: true }), platform };
    expect(command.complete("thinking-block-expand ", context)).toEqual({
      items: [
        { value: "on", label: "on", description: "<on|off> — current: on" },
        { value: "off", label: "off", description: "<on|off> — current: on" },
      ],
    });
  });

  test("complete filters values by substring", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("thinking-block-expand of", context)).toEqual({
      items: [{ value: "off", label: "off", description: "<on|off> — current: off" }],
    });
  });

  test("complete suppresses an exact match", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("diff-block-expand on", context)).toBe(null);
  });

  test("complete value descriptions include the arg hint and current status", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState({ toolCardsExpanded: true }), platform };
    const completion = command.complete("diff-block-expand ", context);
    expect(completion?.items).toEqual([
      { value: "on", label: "on", description: "<on|off> — current: on" },
      { value: "off", label: "off", description: "<on|off> — current: on" },
    ]);
  });
});
