import { makePlatform, makeTuiState } from "../../test";
import { NotificationCommand } from "./notification-command";

describe("NotificationCommand", () => {
  const command = new NotificationCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("notification");
    expect(command.meta.description).toBe("toggle notification settings");
    expect(command.meta.argumentHint).toBe("sound enable|disable");
  });

  test("resolve enables sound notifications", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["sound", "enable"])).toEqual({
      kind: "platform",
      slashName: "notification sound",
      command: { name: "setNotificationSoundEnabled", enabled: true },
      transient: "sound notifications enabled",
    });
  });

  test("resolve disables sound notifications", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["sound", "disable"])).toEqual({
      kind: "platform",
      slashName: "notification sound",
      command: { name: "setNotificationSoundEnabled", enabled: false },
      transient: "sound notifications disabled",
    });
  });

  test("resolve with an unknown subcommand reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["volume", "enable"])).toEqual({ kind: "error", text: "/notification sound enable|disable" });
  });

  test("resolve with a missing value reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["sound"])).toEqual({ kind: "error", text: "/notification sound enable|disable" });
  });

  test("resolve with an invalid value reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["sound", "loud"])).toEqual({ kind: "error", text: "/notification sound enable|disable" });
  });

  test("complete returns the sound subcommand", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "sound", label: "sound" }],
    });
  });

  test("complete returns enable and disable prefixed by sound", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("sound ", context);
    expect(result).toEqual({
      items: [
        { value: "sound enable", label: "enable" },
        { value: "sound disable", label: "disable" },
      ],
    });
  });

  test("complete filters values by prefix", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("sound e", context);
    expect(result).toEqual({
      items: [{ value: "sound enable", label: "enable" }],
    });
  });

  test("complete suppresses an exact match", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("sound enable", context)).toBe(null);
  });
});
