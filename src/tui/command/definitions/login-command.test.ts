import { makeTuiState } from "../../test";
import { LoginCommand } from "./login-command";
import { makePlatform } from "./_test-fixture";

describe("LoginCommand", () => {
  const command = new LoginCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("login");
    expect(command.meta.description).toBe("store a provider API key");
    expect(command.meta.argumentHint).toBe("<provider> <apiKey>");
  });

  test("resolve requires a provider and an API key", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["anthropic"])).toEqual({ kind: "error", text: "/login <provider> <apiKey>" });
  });

  test("resolve builds the login command", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["anthropic", "sk-x"])).toEqual({
      kind: "platform",
      slashName: "login",
      command: { name: "login", provider: "anthropic", apiKey: "sk-x" },
      transient: "logged in to anthropic",
    });
  });

  test("complete returns providers for the first token", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) =>
        cmd.name === "listProviders" ? [{ id: "anthropic", description: "Anthropic" }] : null,
      ),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "anthropic", label: "anthropic", description: "Anthropic" }],
    });
  });

  test("complete returns null after the provider is chosen", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "listProviders" ? [{ id: "anthropic" }] : null)),
    };
    expect(await command.complete("anthropic ", context)).toBe(null);
    expect(await command.complete("anthropic sk-x", context)).toBe(null);
  });
});
