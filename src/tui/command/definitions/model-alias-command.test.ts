import { makePlatform, makeTuiState } from "../../test";
import { ModelAliasCommand } from "./model-alias-command";

const LIST_RESULT = [
  { alias: "large", modelRef: "anthropic/claude-sonnet-4-5" },
  { alias: "small", modelRef: "openai/gpt-4o-mini" },
] as const;

describe("ModelAliasCommand", () => {
  const command = new ModelAliasCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("model-alias");
    expect(command.meta.description).toBe("set or list model aliases");
    expect(command.meta.argumentHint).toBe("[<alias> <provider/modelId>]");
  });

  test("resolve with no args queries aliases", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getModelAliases") return [...LIST_RESULT];
      if (cmd.name === "getDefaultModel") return { provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null };
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, []);
    expect(result).toEqual({
      kind: "reply",
      text: "model aliases: large=anthropic/claude-sonnet-4-5, small=openai/gpt-4o-mini; default: anthropic/claude-sonnet-4-5",
    });
  });

  test("resolve with no args shows unset default when no default is configured", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getModelAliases") return [];
      if (cmd.name === "getDefaultModel") return null;
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, []);
    expect(result).toEqual({
      kind: "reply",
      text: "no model aliases set; default: unset",
    });
  });

  test("resolve requires an alias", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["anthropic/claude-sonnet-4-5"])).toEqual({
      kind: "error",
      text: "/model-alias: unknown alias 'anthropic/claude-sonnet-4-5' (expected large | medium | small)",
    });
  });

  test("resolve requires a model reference", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["large"])).toEqual({
      kind: "error",
      text: "/model-alias <large|medium|small> <provider>/<modelId>",
    });
  });

  test("resolve rejects an invalid model reference", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["large", "claude"])).toEqual({
      kind: "error",
      text: "/model-alias: invalid 'claude' (expected <provider>/<modelId>)",
    });
  });

  test("resolve builds the setModelAlias command", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["large", "anthropic/claude-sonnet-4-5"])).toEqual({
      kind: "platform",
      slashName: "model-alias",
      command: { name: "setModelAlias", alias: "large", provider: "anthropic", id: "claude-sonnet-4-5" },
      transient: "model alias 'large' set to anthropic/claude-sonnet-4-5",
    });
  });

  test("complete returns alias names", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.complete("l", context)).toEqual({
      items: [
        { value: "large", label: "large" },
      ],
    });
  });

  test("complete returns filtered models for the chosen alias", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listFilteredModels") {
        return {
          models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }],
          filteredOut: 0,
        };
      }
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("large anthropic/claude-sonnet-", context);
    expect(result).toEqual({
      items: [{ value: "large anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", description: "Claude Sonnet 4.5" }],
    });
  });

  test("complete reports the filtered-out count", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listFilteredModels") {
        return {
          models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }],
          filteredOut: 3,
        };
      }
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("large anthropic/claude-sonnet-", context);
    expect(result).toEqual({
      items: [{ value: "large anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", description: "Claude Sonnet 4.5" }],
      filteredOut: 3,
    });
  });
});
