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

  test("complete returns the setting names", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("", context)).toEqual({
      items: [
        { value: "diff-block-expand", label: "diff-block-expand" },
        { value: "thinking-block-expand", label: "thinking-block-expand" },
      ],
    });
  });

  test("complete filters setting names by prefix", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("thin", context)).toEqual({
      items: [{ value: "thinking-block-expand", label: "thinking-block-expand" }],
    });
  });

  test("complete returns on and off after a setting is chosen", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("diff-block-expand ", context)).toEqual({
      items: [
        { value: "on", label: "on" },
        { value: "off", label: "off" },
      ],
    });
  });

  test("complete filters values by prefix", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("thinking-block-expand of", context)).toEqual({
      items: [{ value: "off", label: "off" }],
    });
  });

  test("complete suppresses an exact match", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("diff-block-expand on", context)).toBe(null);
  });
});
