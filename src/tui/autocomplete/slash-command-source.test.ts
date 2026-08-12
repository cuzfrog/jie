import type { JiePlatform, KanbanCard } from "../../platform";
import type { CommandCatalog, CommandMeta, CommandResolver } from "../command";
import { SLASH_COMMANDS } from "../command/definitions";
import type { StateStore, TuiState } from "../state";
import { makePlatform, makeTuiState } from "../test";
import { SlashCommandSource } from "./slash-command-source";

function signal(): AbortSignal {
  return new AbortController().signal;
}

function makeStateStore(state: TuiState = makeTuiState()): StateStore {
  return vi.mocked<StateStore>({
    getState: vi.fn(() => state),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });
}

function storeWithTeam(): StateStore {
  return makeStateStore(makeTuiState({ teamId: "my-team" }));
}

function storeWithKanban(cards: ReadonlyArray<KanbanCard> = []): StateStore {
  return makeStateStore(makeTuiState({ teamId: "my-team", kanbanBoard: cards }));
}

const commandsByName = new Map<string, typeof SLASH_COMMANDS[number]>();
const aliasToCanonical = new Map<string, string>();
for (const command of SLASH_COMMANDS) {
  commandsByName.set(command.meta.name, command);
  for (const alias of command.meta.aliases ?? []) {
    aliasToCanonical.set(alias, command.meta.name);
  }
}

const commandCatalog: CommandCatalog = {
  metadata: SLASH_COMMANDS.map((command) => command.meta),
  commandMeta(name: string): CommandMeta | null {
    const canonical = aliasToCanonical.get(name) ?? name;
    return commandsByName.get(canonical)?.meta ?? null;
  },
};

function makeCommandResolver(platform: JiePlatform): CommandResolver {
  return {
    resolve: vi.fn(),
    complete: vi.fn((state: TuiState, name: string, argumentText: string) => {
      const canonical = aliasToCanonical.get(name) ?? name;
      const command = commandsByName.get(canonical);
      if (command === undefined) return null;
      return command.complete(argumentText, { state, platform });
    }),
  };
}

function slashSource(platform: JiePlatform, stateStore: StateStore): SlashCommandSource {
  return new SlashCommandSource(commandCatalog, makeCommandResolver(platform), stateStore);
}

describe("SlashCommandSource — slash commands", () => {
  test("/query filters jie slash commands", async () => {
    const suggestions = await slashSource(makePlatform().platform, makeStateStore())
      .getSuggestions(["/he"], 0, 3, { signal: signal() });
    expect(suggestions!.prefix).toBe("/he");
    expect(suggestions!.items.map((item) => item.value)).toContain("help");
  });


  test("plain text yields no suggestions", async () => {
    const suggestions = await slashSource(makePlatform().platform, makeStateStore())
      .getSuggestions(["hello"], 0, 5, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("bare '/' lists every command with its argument hint and description", async () => {
    const suggestions = await slashSource(makePlatform().platform, makeStateStore())
      .getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions!.items).toHaveLength(17);
    const team = suggestions!.items.find((item) => item.value === "team");
    expect(team!.description).toBe("<teamId> — switch the active team");
    const help = suggestions!.items.find((item) => item.value === "help");
    expect(help!.description).toBe("show this help");
    const modelAlias = suggestions!.items.find((item) => item.value === "model-alias");
    expect(modelAlias!.description).toBe("[<alias> <provider/modelId>] — set or list model aliases");
  });
});

describe("SlashCommandSource — unambiguous-command drill-down", () => {
  function drillPlatform(): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getTeamInfo") {
        return { defaultTeam: "alpha", installed: [{ id: "alpha", agentCount: 2 }, { id: "beta", agentCount: 1 }] };
      }
      if (cmd.name === "listSessions") {
        return [
          { sessionId: "alpha-1", messageCount: 3, lastActivity: "2026-07-22T00:00:00.000Z" },
          { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-21T00:00:00.000Z" },
        ];
      }
      if (cmd.name === "listFilteredModels") {
        return { models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }], filteredOut: 0 };
      }
      if (cmd.name === "getModelFilters") return [];
      return null;
    });
    return platform;
  }

  test("'/resum' drills down to resume's session rows labeled 'resume <id>'", async () => {
    const suggestions = await slashSource(drillPlatform(), storeWithTeam())
      .getSuggestions(["/resum"], 0, 6, { signal: signal() });
    expect(suggestions!.prefix).toBe("/resum");
    expect(suggestions!.items.map((item) => item.value)).toEqual(["resume alpha-1", "resume beta-2"]);
    expect(suggestions!.items[0]!.description).toMatch(/^3 msg · /);
  });

  test("'/tea' drills down to team rows with the default badge", async () => {
    const suggestions = await slashSource(drillPlatform(), makeStateStore())
      .getSuggestions(["/tea"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["team alpha", "team beta"]);
    expect(suggestions!.items[0]!.description).toBe("(default)");
  });

  test("'/model-f' drills down to the add/remove/list actions", async () => {
    const suggestions = await slashSource(drillPlatform(), makeStateStore())
      .getSuggestions(["/model-f"], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["model-filter add", "model-filter remove", "model-filter list"]);
  });

  test("'/eff' drills down to the effort-level rows", async () => {
    const suggestions = await slashSource(drillPlatform(), makeStateStore())
      .getSuggestions(["/eff"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value))
      .toEqual(["effort off", "effort low", "effort medium", "effort high", "effort max"]);
  });

  test("a multi-match prefix keeps the plain command candidates", async () => {
    const suggestions = await slashSource(drillPlatform(), storeWithTeam())
      .getSuggestions(["/re"], 0, 3, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value).sort()).toEqual(["reload", "rename", "resume"]);
  });

  test("falls back to the command candidate when argument completion is empty", async () => {
    const suggestions = await slashSource(drillPlatform(), makeStateStore())
      .getSuggestions(["/resum"], 0, 6, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["resume"]);
  });

  test("a no-argument command keeps the plain command candidate", async () => {
    const suggestions = await slashSource(drillPlatform(), makeStateStore())
      .getSuggestions(["/hel"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["help"]);
  });

});

describe("SlashCommandSource — /team arguments", () => {
  function teamPlatform(): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getTeamInfo") {
        return {
          defaultTeam: "alpha",
          installed: [{ id: "default-solo", agentCount: 1 }, { id: "alpha", agentCount: 3 }, { id: "beta", agentCount: 2 }],
        };
      }
      return null;
    });
    return platform;
  }

  test("suggests installed teams after '/team ' with the default marked", async () => {
    const suggestions = await slashSource(teamPlatform(), makeStateStore())
      .getSuggestions(["/team "], 0, 6, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "default-solo", label: "default-solo", description: "1 agent" },
      { value: "alpha", label: "alpha", description: "(default)" },
      { value: "beta", label: "beta", description: "2 agents" },
    ]);
  });

  test("filters teams by the typed argument prefix", async () => {
    const suggestions = await slashSource(teamPlatform(), makeStateStore())
      .getSuggestions(["/team al"], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["alpha"]);
  });

  test("a fully typed team id yields no suggestions so Enter submits directly", async () => {
    const suggestions = await slashSource(teamPlatform(), makeStateStore())
      .getSuggestions(["/team alpha"], 0, 11, { signal: signal() });
    expect(suggestions).toBeNull();
  });

});

describe("SlashCommandSource — /resume arguments", () => {
  function sessionPlatform(): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listSessions") {
        return [
          { sessionId: "alpha-1", messageCount: 3, lastActivity: "2026-07-22T00:00:00.000Z" },
          { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-21T00:00:00.000Z" },
        ];
      }
      return null;
    });
    return platform;
  }

  test("suggests sessions after '/resume ' with message count and age", async () => {
    const suggestions = await slashSource(sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume "], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["alpha-1", "beta-2"]);
    expect(suggestions!.items[0]!.description).toMatch(/^3 msg · /);
    expect(suggestions!.items[1]!.description).toMatch(/^12 msg · /);
  });

  function namedSessionPlatform(): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listSessions") {
        return [
          { sessionId: "01HZX-ULID", name: "refactor pass", messageCount: 3, lastActivity: "2026-07-22T00:00:00.000Z" },
          { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-21T00:00:00.000Z" },
        ];
      }
      return null;
    });
    return platform;
  }

  test("filters sessions by the typed argument prefix", async () => {
    const suggestions = await slashSource(sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume be"], 0, 10, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["beta-2"]);
  });

  test("shows a renamed session's name as the label, keeping the sessionId as the committed value", async () => {
    const suggestions = await slashSource(namedSessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume "], 0, 8, { signal: signal() });
    expect(suggestions!.items[0]!.label).toBe("refactor pass");
    expect(suggestions!.items[0]!.value).toBe("01HZX-ULID");
    expect(suggestions!.items[0]!.description).toMatch(/^3 msg · /);
    expect(suggestions!.items[1]!.label).toBe("beta-2");
  });

  test("filters sessions by name prefix in addition to session id", async () => {
    const suggestions = await slashSource(namedSessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume ref"], 0, 11, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["01HZX-ULID"]);
  });

  test("a fully typed session id yields no suggestions so Enter submits directly", async () => {
    const suggestions = await slashSource(sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume alpha-1"], 0, 15, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when no team is loaded", async () => {
    const { platform, execute } = makePlatform();
    const suggestions = await slashSource(platform, makeStateStore())
      .getSuggestions(["/resume "], 0, 8, { signal: signal() });
    expect(suggestions).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("SlashCommandSource — /effort arguments", () => {
  test("suggests the five effort levels after '/effort '", async () => {
    const suggestions = await slashSource(makePlatform().platform, makeStateStore())
      .getSuggestions(["/effort "], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["off", "low", "medium", "high", "max"]);
  });

  test("filters effort levels by the typed prefix", async () => {
    const suggestions = await slashSource(makePlatform().platform, makeStateStore())
      .getSuggestions(["/effort h"], 0, 9, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["high"]);
  });

  test("a fully typed effort level yields no suggestions so Enter submits directly", async () => {
    const suggestions = await slashSource(makePlatform().platform, makeStateStore())
      .getSuggestions(["/effort high"], 0, 12, { signal: signal() });
    expect(suggestions).toBeNull();
  });
});

describe("SlashCommandSource — /model arguments", () => {
  const MODELS: ReadonlyArray<{ provider: string; id: string; name: string; available: boolean }> = [
    { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true },
    { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5", available: true },
    { provider: "openai", id: "gpt-5", name: "GPT-5", available: true },
  ];

  function modelPlatform(
    models: ReadonlyArray<{ provider: string; id: string; name: string; available: boolean }>,
    filters: ReadonlyArray<string> = [],
  ): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listFilteredModels") {
        const available = models.filter((model) => model.available);
        const target = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`.toLowerCase();
        const matched = filters.length === 0 ? available : available.filter((model) => filters.some((filter) => target(model).includes(filter.toLowerCase())));
        return { models: matched, filteredOut: available.length - matched.length };
      }
      return null;
    });
    return platform;
  }

  test("suggests registry models as provider/modelId with the model name as description", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", description: "Claude Sonnet 4.5" },
      { value: "anthropic/claude-opus-4-5", label: "anthropic/claude-opus-4-5", description: "Claude Opus 4.5" },
      { value: "openai/gpt-5", label: "openai/gpt-5", description: "GPT-5" },
    ]);
  });

  test("filters models by the provider segment", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model anth"], 0, 11, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-5"]);
  });

  test("filters models across the provider/modelId boundary", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model anthropic/claude-o"], 0, 25, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-opus-4-5"]);
  });

  test("a fully typed provider/modelId yields no suggestions so Enter submits directly", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model openai/gpt-5"], 0, 19, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when no model matches", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model google/"], 0, 14, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when the registry lists no models", async () => {
    const suggestions = await slashSource(modelPlatform([]), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("caps the suggestion list at twenty entries", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      provider: "anthropic", id: `model-${index}`, name: `Model ${index}`, available: true,
    }));
    const suggestions = await slashSource(modelPlatform(many), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items).toHaveLength(20);
  });

  test("hides models whose provider is not available", async () => {
    const models = [
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true },
      { provider: "openai", id: "gpt-5", name: "GPT-5", available: false },
    ];
    const suggestions = await slashSource(modelPlatform(models), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-sonnet-4-5"]);
    expect(suggestions!.filteredOut).toBeUndefined();
  });

  test("applies model filters and reports how many models were filtered out", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS, ["gpt"]), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["openai/gpt-5"]);
    expect(suggestions!.filteredOut).toBe(2);
  });

  test("filter patterns match case-insensitively anywhere in provider/modelId", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS, ["CLAUDE"]), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-5"]);
    expect(suggestions!.filteredOut).toBe(1);
  });

  test("omits filteredOut when no filter is set", async () => {
    const suggestions = await slashSource(modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.filteredOut).toBeUndefined();
  });
});

describe("SlashCommandSource — /model-filter arguments", () => {
  function filterPlatform(filters: ReadonlyArray<string>): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "getModelFilters") return filters;
      return null;
    });
    return platform;
  }

  test("suggests the add, remove and list actions after the command", async () => {
    const suggestions = await slashSource(filterPlatform([]), makeStateStore())
      .getSuggestions(["/model-filter "], 0, 14, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["add", "remove", "list"]);
  });

  test("filters the actions by the typed prefix", async () => {
    const suggestions = await slashSource(filterPlatform([]), makeStateStore())
      .getSuggestions(["/model-filter r"], 0, 15, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["remove"]);
  });

  test("the list action matches its own prefix", async () => {
    const suggestions = await slashSource(filterPlatform([]), makeStateStore())
      .getSuggestions(["/model-filter l"], 0, 15, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["list"]);
  });

  test("a fully typed list yields no suggestions so Enter submits", async () => {
    const suggestions = await slashSource(filterPlatform([]), makeStateStore())
      .getSuggestions(["/model-filter list"], 0, 18, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("a fully typed remove lists the stored patterns", async () => {
    const suggestions = await slashSource(filterPlatform(["qwen", "gpt"]), makeStateStore())
      .getSuggestions(["/model-filter remove"], 0, 20, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "remove qwen", label: "qwen" },
      { value: "remove gpt", label: "gpt" },
    ]);
  });

  test("a fully typed remove yields no suggestions when no filter is stored", async () => {
    const suggestions = await slashSource(filterPlatform([]), makeStateStore())
      .getSuggestions(["/model-filter remove"], 0, 20, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("a fully typed add yields no suggestions so Enter submits", async () => {
    const suggestions = await slashSource(filterPlatform(["qwen"]), makeStateStore())
      .getSuggestions(["/model-filter add"], 0, 17, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("after remove, suggests the stored filter patterns", async () => {
    const suggestions = await slashSource(filterPlatform(["qwen", "gpt"]), makeStateStore())
      .getSuggestions(["/model-filter remove "], 0, 21, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "remove qwen", label: "qwen" },
      { value: "remove gpt", label: "gpt" },
    ]);
  });

  test("filters the stored patterns by the typed prefix", async () => {
    const suggestions = await slashSource(filterPlatform(["qwen", "gpt"]), makeStateStore())
      .getSuggestions(["/model-filter remove q"], 0, 22, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["remove qwen"]);
  });

  test("a fully typed stored pattern yields no suggestions so Enter submits", async () => {
    const suggestions = await slashSource(filterPlatform(["qwen"]), makeStateStore())
      .getSuggestions(["/model-filter remove qwen"], 0, 25, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("add stays free-form and suggests no stored patterns", async () => {
    const suggestions = await slashSource(filterPlatform(["qwen"]), makeStateStore())
      .getSuggestions(["/model-filter add "], 0, 18, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no patterns when no filter is stored", async () => {
    const suggestions = await slashSource(filterPlatform([]), makeStateStore())
      .getSuggestions(["/model-filter remove "], 0, 21, { signal: signal() });
    expect(suggestions).toBeNull();
  });
});

describe("SlashCommandSource — /login arguments", () => {
  const PROVIDERS: ReadonlyArray<{ id: string; description?: string }> = [
    { id: "my-local", description: "configured" },
    { id: "anthropic", description: "ANTHROPIC_API_KEY" },
    { id: "openai" },
  ];

  function providerPlatform(providers: ReadonlyArray<{ id: string; description?: string }>): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listProviders") return providers;
      return null;
    });
    return platform;
  }

  test("suggests providers with their descriptions after '/login '", async () => {
    const suggestions = await slashSource(providerPlatform(PROVIDERS), makeStateStore())
      .getSuggestions(["/login "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["my-local", "anthropic", "openai"]);
    expect(suggestions!.items[0]!.description).toBe("configured");
    expect(suggestions!.items[1]!.description).toBe("ANTHROPIC_API_KEY");
    expect(suggestions!.items[2]!.description).toBeUndefined();
  });

  test("filters providers by the typed prefix", async () => {
    const suggestions = await slashSource(providerPlatform(PROVIDERS), makeStateStore())
      .getSuggestions(["/login an"], 0, 9, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic"]);
  });

  test("a fully typed provider yields no suggestions so Enter submits directly", async () => {
    const suggestions = await slashSource(providerPlatform(PROVIDERS), makeStateStore())
      .getSuggestions(["/login anthropic"], 0, 16, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when the registry lists no providers", async () => {
    const suggestions = await slashSource(providerPlatform([]), makeStateStore())
      .getSuggestions(["/login "], 0, 7, { signal: signal() });
    expect(suggestions).toBeNull();
  });

});

describe("SlashCommandSource — /logout arguments", () => {
  function logoutPlatform(): JiePlatform {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async (cmd: { readonly name: string }) => {
      if (cmd.name === "listProviders") {
        return [{ id: "anthropic", description: "ANTHROPIC_API_KEY" }, { id: "openai" }];
      }
      return null;
    });
    return platform;
  }

  test("suggests the logout-all star first, then the providers", async () => {
    const suggestions = await slashSource(logoutPlatform(), makeStateStore())
      .getSuggestions(["/logout "], 0, 8, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "*", label: "*", description: "all providers" },
      { value: "anthropic", label: "anthropic", description: "ANTHROPIC_API_KEY" },
      { value: "openai", label: "openai" },
    ]);
  });

  test("a fully typed star yields no suggestions so Enter submits directly", async () => {
    const suggestions = await slashSource(logoutPlatform(), makeStateStore())
      .getSuggestions(["/logout *"], 0, 9, { signal: signal() });
    expect(suggestions).toBeNull();
  });
});

describe("SlashCommandSource — /kanban arguments", () => {
  const BOARD: ReadonlyArray<KanbanCard> = [
    { id: "#1", content: "write spec", status: "pending" },
    { id: "#2", content: "implement tool", status: "in_progress" },
    { id: "#3", content: "rename todo", status: "completed" },
  ];

  test("drills down to subcommands from an unambiguous command prefix", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanb"], 0, 5, { signal: signal() });
    expect(suggestions!.prefix).toBe("/kanb");
    expect(suggestions!.items.map((item) => item.value)).toEqual(["kanban add", "kanban remove", "kanban complete", "kanban review", "kanban handoff"]);
    expect(suggestions!.items[0]!.description).toBe("[--title <title>] <description>");
    expect(suggestions!.items[1]!.description).toBe("<cardId>");
  });

  test("suggests subcommands after '/kanban ' with their argument hints", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban "], 0, 8, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "add", label: "add", description: "[--title <title>] <description>" },
      { value: "remove", label: "remove", description: "<cardId>" },
      { value: "complete", label: "complete", description: "<cardId>" },
      { value: "review", label: "review", description: "<cardId>" },
      { value: "handoff", label: "handoff", description: "[<teamId>/]<cardId> <targetTeamId>" },
    ]);
  });

  test("filters subcommands by the typed prefix", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban r"], 0, 9, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["remove", "review"]);
  });

  test("a fully typed add yields no suggestions so the user can type the description", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban add"], 0, 11, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("suggests card ids after '/kanban remove '", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban remove "], 0, 15, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["remove #1", "remove #2", "remove #3"]);
    expect(suggestions!.items[0]!.label).toBe("#1");
    expect(suggestions!.items[0]!.description).toBe("write spec");
  });

  test("suggests card ids after '/kanban complete ' excluding already-completed cards", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban complete "], 0, 17, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["complete #1", "complete #2"]);
  });

  test("suggests card ids after '/kanban review '", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban review "], 0, 15, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["review #1", "review #2", "review #3"]);
  });

  test("filters card ids by the typed prefix", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban remove #"], 0, 16, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["remove #1", "remove #2", "remove #3"]);
  });

  test("yields no suggestions when the subcommand is unknown", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban(BOARD))
      .getSuggestions(["/kanban bogus"], 0, 13, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no card ids for remove when the board is empty", async () => {
    const suggestions = await slashSource(makePlatform().platform, storeWithKanban())
      .getSuggestions(["/kanban remove "], 0, 15, { signal: signal() });
    expect(suggestions).toBeNull();
  });


});
