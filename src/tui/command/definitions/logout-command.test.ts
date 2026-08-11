import { makeTuiState } from "../../test";
import { LogoutCommand } from "./logout-command";
import { makePlatform } from "./_test-fixture";

describe("LogoutCommand", () => {
  const command = new LogoutCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("logout");
    expect(command.meta.description).toBe("remove one or all API keys");
    expect(command.meta.argumentHint).toBe("<provider>|*");
  });

  test("resolve requires a provider", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/logout <provider>|*" });
  });

  test("resolve logs out of a single provider", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["anthropic"])).toEqual({
      kind: "platform",
      slashName: "logout",
      command: { name: "logout", provider: "anthropic" },
      transient: "logged out of anthropic",
    });
  });

  test("resolve logs out of all providers", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["*"])).toEqual({
      kind: "platform",
      slashName: "logout",
      command: { name: "logout", provider: "*" },
      transient: "logged out of all providers",
    });
  });

  test("complete returns providers and the wildcard", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) =>
        cmd.name === "listProviders" ? [{ id: "anthropic", description: "Anthropic" }] : null,
      ),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "*", label: "*", description: "all providers" },
        { value: "anthropic", label: "anthropic", description: "Anthropic" },
      ],
    });
  });
});
