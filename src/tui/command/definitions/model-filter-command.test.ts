import type { Command } from "../../../platform";
import { makePlatform, makeTuiState } from "../../test";
import { ModelFilterCommand } from "./model-filter-command";

describe("ModelFilterCommand", () => {
  const command = new ModelFilterCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("model-filter");
    expect(command.meta.description).toBe("filter the /model list");
    expect(command.meta.argumentHint).toBe("<add|remove|list> <pattern>");
  });

  test("resolve with no arguments reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/model-filter <add|remove|list> <pattern>" });
  });

  test("resolve list reports stored filters", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: Command) => {
      if (cmd.name === "getModelFilters") return ["qwen", "anthropic"];
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, ["list"]);
    expect(result).toEqual({ kind: "reply", text: "model filters: qwen · anthropic" });
  });

  test("resolve list with an extra argument reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["list", "extra"])).toEqual({ kind: "error", text: "/model-filter <add|remove|list> <pattern>" });
  });

  test("resolve add appends a new pattern after validation", async () => {
    const { platform, execute } = makePlatform();
    const calls: Array<Command> = [];
    execute.mockImplementation(async (cmd: Command) => {
      calls.push(cmd);
      if (cmd.name === "getModelFilters") return [];
      if (cmd.name === "validateModelFilter") return null;
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, ["add", "qwen"]);
    expect(calls).toHaveLength(2);
    expect(calls[0].name).toBe("getModelFilters");
    expect(calls[1]).toMatchObject({ name: "validateModelFilter", pattern: "qwen", existingFilters: [] as const });
    expect(result).toEqual({
      kind: "platform",
      slashName: "model-filter",
      command: { name: "setModelFilters", filters: ["qwen"] },
      transient: "model filter added: qwen",
    });
  });

  test("resolve add does not duplicate an existing pattern", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: Command) => {
      if (cmd.name === "getModelFilters") return ["qwen"];
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, ["add", "qwen"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "model-filter",
      command: { name: "setModelFilters", filters: ["qwen"] },
      transient: "model filter added: qwen",
    });
  });

  test("resolve add rejects a pattern that the platform validation rejects", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: Command) => {
      if (cmd.name === "getModelFilters") return [];
      if (cmd.name === "validateModelFilter") return "/model-filter: pattern 'xyz' rejected";
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, ["add", "xyz"]);
    expect(result).toEqual({ kind: "error", text: "/model-filter: pattern 'xyz' rejected" });
  });

  test("resolve remove drops an existing pattern", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: Command) => {
      if (cmd.name === "getModelFilters") return ["qwen", "anthropic"];
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, ["remove", "qwen"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "model-filter",
      command: { name: "setModelFilters", filters: ["anthropic"] },
      transient: "model filter removed: qwen",
    });
  });

  test("resolve remove reports an unset pattern", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: Command) => {
      if (cmd.name === "getModelFilters") return ["anthropic"];
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.resolve(context, ["remove", "qwen"]);
    expect(result).toEqual({ kind: "error", text: "/model-filter: pattern 'qwen' is not set" });
  });

  test("resolve with an unknown action reports usage", () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(command.resolve(context, ["toggle", "qwen"])).toEqual({ kind: "error", text: "/model-filter <add|remove|list> <pattern>" });
  });

  test("complete returns actions", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "add", label: "add" },
        { value: "remove", label: "remove" },
        { value: "list", label: "list" },
      ],
    });
  });

  test("complete filters actions by substring", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("r", context);
    expect(result).toEqual({
      items: [{ value: "remove", label: "remove" }],
    });
  });

  test("complete returns stored patterns for remove", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: Command) => {
      if (cmd.name === "getModelFilters") return ["qwen", "anthropic"];
      return null;
    });
    const context = { state: makeTuiState(), platform };
    const result = await command.complete("remove ", context);
    expect(result).toEqual({
      items: [
        { value: "remove qwen", label: "qwen" },
        { value: "remove anthropic", label: "anthropic" },
      ],
    });
  });

  test("complete returns null for add and list", async () => {
    const { platform } = makePlatform();
    const context = { state: makeTuiState(), platform };
    expect(await command.complete("add ", context)).toBe(null);
    expect(await command.complete("list", context)).toBe(null);
  });
});
