import { makeTuiState } from "../../test";
import { ModelCommand } from "./model-command";
import { makePlatform } from "./_test-fixture";

describe("ModelCommand", () => {
  const command = new ModelCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("model");
    expect(command.meta.description).toBe("set the default model");
    expect(command.meta.argumentHint).toBe("<provider>/<modelId>");
  });

  test("resolve requires a model reference", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/model <provider>/<modelId>" });
  });

  test("resolve rejects an invalid model reference", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["claude"])).toEqual({ kind: "error", text: "/model: invalid 'claude' (expected <provider>/<modelId>)" });
  });

  test("resolve builds the setDefaultModel command", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["anthropic/claude-sonnet-4-5"])).toEqual({
      kind: "platform",
      slashName: "model",
      command: { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" },
      transient: "default model set to anthropic/claude-sonnet-4-5",
    });
  });

  test("complete returns filtered models", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        if (cmd.name === "listFilteredModels") {
          return {
            models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }],
            filteredOut: 0,
          };
        }
        return null;
      }),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", description: "Claude Sonnet 4.5" }],
    });
  });

  test("complete reports the filtered-out count", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        if (cmd.name === "listFilteredModels") {
          return {
            models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }],
            filteredOut: 3,
          };
        }
        return null;
      }),
    };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [{ value: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", description: "Claude Sonnet 4.5" }],
      filteredOut: 3,
    });
  });

  test("complete suppresses an exact match", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        if (cmd.name === "listFilteredModels") {
          return {
            models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }],
            filteredOut: 0,
          };
        }
        return null;
      }),
    };
    expect(await command.complete("anthropic/claude-sonnet-4-5", context)).toBe(null);
  });
});
