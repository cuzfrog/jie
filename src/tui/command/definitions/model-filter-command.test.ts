import type { Command } from "../../../platform";
import { makeTuiState } from "../../test";
import { ModelFilterCommand } from "./model-filter-command";
import { makePlatform } from "./_test-fixture";

describe("ModelFilterCommand", () => {
  const command = new ModelFilterCommand();

  test("meta", () => {
    expect(command.meta.name).toBe("model-filter");
    expect(command.meta.description).toBe("filter the /model list");
    expect(command.meta.argumentHint).toBe("<add|remove|list> <pattern>");
  });

  test("resolve with no arguments reports usage", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, [])).toEqual({ kind: "error", text: "/model-filter <add|remove|list> <pattern>" });
  });

  test("resolve list reports stored filters", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "getModelFilters" ? ["qwen", "anthropic"] : null)),
    };
    const result = await command.resolve(context, ["list"]);
    expect(result).toEqual({ kind: "reply", text: "model filters: qwen · anthropic" });
  });

  test("resolve list with an extra argument reports usage", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["list", "extra"])).toEqual({ kind: "error", text: "/model-filter <add|remove|list> <pattern>" });
  });

  test("resolve add appends a new pattern after validation", async () => {
    const calls: Array<Command> = [];
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        calls.push(cmd);
        if (cmd.name === "getModelFilters") return [];
        if (cmd.name === "validateModelFilter") return null;
        return null;
      }),
    };
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
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "getModelFilters" ? ["qwen"] : null)),
    };
    const result = await command.resolve(context, ["add", "qwen"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "model-filter",
      command: { name: "setModelFilters", filters: ["qwen"] },
      transient: "model filter added: qwen",
    });
  });

  test("resolve add rejects a pattern that the platform validation rejects", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => {
        if (cmd.name === "getModelFilters") return [];
        if (cmd.name === "validateModelFilter") return "/model-filter: pattern 'xyz' rejected";
        return null;
      }),
    };
    const result = await command.resolve(context, ["add", "xyz"]);
    expect(result).toEqual({ kind: "error", text: "/model-filter: pattern 'xyz' rejected" });
  });

  test("resolve remove drops an existing pattern", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "getModelFilters" ? ["qwen", "anthropic"] : null)),
    };
    const result = await command.resolve(context, ["remove", "qwen"]);
    expect(result).toEqual({
      kind: "platform",
      slashName: "model-filter",
      command: { name: "setModelFilters", filters: ["anthropic"] },
      transient: "model filter removed: qwen",
    });
  });

  test("resolve remove reports an unset pattern", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "getModelFilters" ? ["anthropic"] : null)),
    };
    const result = await command.resolve(context, ["remove", "qwen"]);
    expect(result).toEqual({ kind: "error", text: "/model-filter: pattern 'qwen' is not set" });
  });

  test("resolve with an unknown action reports usage", () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(command.resolve(context, ["toggle", "qwen"])).toEqual({ kind: "error", text: "/model-filter <add|remove|list> <pattern>" });
  });

  test("complete returns actions", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    const result = await command.complete("", context);
    expect(result).toEqual({
      items: [
        { value: "add", label: "add" },
        { value: "remove", label: "remove" },
        { value: "list", label: "list" },
      ],
    });
  });

  test("complete filters actions by prefix", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    const result = await command.complete("r", context);
    expect(result).toEqual({
      items: [{ value: "remove", label: "remove" }],
    });
  });

  test("complete returns stored patterns for remove", async () => {
    const context = {
      state: makeTuiState(),
      platform: makePlatform(async (cmd) => (cmd.name === "getModelFilters" ? ["qwen", "anthropic"] : null)),
    };
    const result = await command.complete("remove ", context);
    expect(result).toEqual({
      items: [
        { value: "remove qwen", label: "qwen" },
        { value: "remove anthropic", label: "anthropic" },
      ],
    });
  });

  test("complete returns null for add and list", async () => {
    const context = { state: makeTuiState(), platform: makePlatform() };
    expect(await command.complete("add ", context)).toBe(null);
    expect(await command.complete("list", context)).toBe(null);
  });
});
