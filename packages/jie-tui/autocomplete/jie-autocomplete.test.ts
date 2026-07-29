import { type JiePlatform } from "@cuzfrog/jie-platform";
import { type ScannedFile } from "../file-mention";
import { type StateStore, type TuiState } from "../state";
import { makeTuiState } from "../test";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";

const CWD = "/proj";

const SCANNED_FILES: ReadonlyArray<ScannedFile> = [
  { absPath: "/proj/src/main.ts", relPath: "src/main.ts" },
  { absPath: "/proj/src/helper.ts", relPath: "src/helper.ts" },
];

function scanFixture(): ReadonlyArray<ScannedFile> {
  return SCANNED_FILES;
}

function noScan(): ReadonlyArray<ScannedFile> {
  return [];
}

function signal(): AbortSignal {
  return new AbortController().signal;
}

function makePlatform(execute: ReturnType<typeof vi.fn>): JiePlatform {
  return vi.mocked<JiePlatform>({
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    teams: vi.fn(() => []),
    execute,
    shutdown: vi.fn(),
  });
}

function nullPlatform(): JiePlatform {
  return makePlatform(vi.fn(async () => null));
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

describe("createJieAutocompleteProvider — @-mentions", () => {
  test("@query resolves matching project files with @-prefixed values", async () => {
    const suggestions = await new JieAutocompleteProviderImpl(CWD, scanFixture, nullPlatform(), makeStateStore())
      .getSuggestions(["@mai"], 0, 4, { signal: signal() });
    expect(suggestions).not.toBeNull();
    expect(suggestions!.prefix).toBe("@mai");
    expect(suggestions!.items[0]).toEqual({ value: "@src/main.ts", label: "src/main.ts" });
  });

  test("@ with no match returns null", async () => {
    const suggestions = await new JieAutocompleteProviderImpl(CWD, scanFixture, nullPlatform(), makeStateStore())
      .getSuggestions(["@zzz"], 0, 4, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("@ mid-line after a space still triggers", async () => {
    const suggestions = await new JieAutocompleteProviderImpl(CWD, scanFixture, nullPlatform(), makeStateStore())
      .getSuggestions(["look at @hel"], 0, 12, { signal: signal() });
    expect(suggestions!.items[0]!.value).toBe("@src/helper.ts");
  });

  test("applyCompletion replaces the @ token with the resolved path and a trailing space", () => {
    const result = new JieAutocompleteProviderImpl(CWD, scanFixture, nullPlatform(), makeStateStore())
      .applyCompletion(["@mai"], 0, 4, { value: "@src/main.ts", label: "src/main.ts" }, "@mai");
    expect(result.lines).toEqual(["@src/main.ts "]);
    expect(result.cursorCol).toBe(13);
  });
});

describe("createJieAutocompleteProvider — slash commands", () => {
  test("/query filters jie slash commands", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["/he"], 0, 3, { signal: signal() });
    expect(suggestions!.prefix).toBe("/he");
    expect(suggestions!.items.map((item) => item.value)).toContain("help");
  });

  test("slash completion appends the command name and a trailing space", () => {
    const result = new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .applyCompletion(["/he"], 0, 3, { value: "help", label: "help" }, "/he");
    expect(result.lines).toEqual(["/help "]);
    expect(result.cursorCol).toBe(6);
  });

  test("plain text yields no suggestions", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["hello"], 0, 5, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("bare '/' lists every command with its argument hint and description", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions!.items).toHaveLength(11);
    const team = suggestions!.items.find((item) => item.value === "team");
    expect(team!.description).toBe("<teamId> — switch the active team");
    const help = suggestions!.items.find((item) => item.value === "help");
    expect(help!.description).toBe("show this help");
  });
});

describe("createJieAutocompleteProvider — unambiguous-command drill-down", () => {
  function drillPlatform(): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "getTeamInfo") {
        return { defaultTeam: "alpha", installed: [{ id: "alpha", agentCount: 2 }, { id: "beta", agentCount: 1 }] };
      }
      if (cmd.name === "listSessions") {
        return [
          { sessionId: "alpha-1", messageCount: 3, lastActivity: "2026-07-22T00:00:00.000Z" },
          { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-21T00:00:00.000Z" },
        ];
      }
      if (cmd.name === "listModels") {
        return [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }];
      }
      if (cmd.name === "getModelFilters") return [];
      return null;
    }));
  }

  test("'/resum' drills down to resume's session rows labeled 'resume <id>'", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), storeWithTeam())
      .getSuggestions(["/resum"], 0, 6, { signal: signal() });
    expect(suggestions!.prefix).toBe("/resum");
    expect(suggestions!.items.map((item) => item.value)).toEqual(["resume alpha-1", "resume beta-2"]);
    expect(suggestions!.items[0]!.description).toMatch(/^3 msg · /);
  });

  test("'/tea' drills down to team rows with the default badge", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), makeStateStore())
      .getSuggestions(["/tea"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["team alpha", "team beta"]);
    expect(suggestions!.items[0]!.description).toBe("(default)");
  });

  test("'/model-f' drills down to the add/remove actions", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), makeStateStore())
      .getSuggestions(["/model-f"], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["model-filter add", "model-filter remove"]);
  });

  test("'/eff' drills down to the effort-level rows", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), makeStateStore())
      .getSuggestions(["/eff"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value))
      .toEqual(["effort off", "effort low", "effort medium", "effort high", "effort max"]);
  });

  test("a multi-match prefix keeps the plain command candidates", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), storeWithTeam())
      .getSuggestions(["/re"], 0, 3, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value).sort()).toEqual(["rename", "resume"]);
  });

  test("falls back to the command candidate when argument completion is empty", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), makeStateStore())
      .getSuggestions(["/resum"], 0, 6, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["resume"]);
  });

  test("a no-argument command keeps the plain command candidate", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), makeStateStore())
      .getSuggestions(["/hel"], 0, 4, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["help"]);
  });

  test("drill-down completion commits '/command arg' with a trailing space", () => {
    const result = new JieAutocompleteProviderImpl("/tmp", noScan, drillPlatform(), storeWithTeam())
      .applyCompletion(["/resum"], 0, 6, { value: "resume alpha-1", label: "resume alpha-1" }, "/resum");
    expect(result.lines).toEqual(["/resume alpha-1 "]);
    expect(result.cursorCol).toBe(16);
  });
});

describe("createJieAutocompleteProvider — /team arguments", () => {
  function teamPlatform(): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "getTeamInfo") {
        return {
          defaultTeam: "alpha",
          installed: [{ id: "minimal", agentCount: 1 }, { id: "alpha", agentCount: 3 }, { id: "beta", agentCount: 2 }],
        };
      }
      return null;
    }));
  }

  test("suggests installed teams after '/team ' with the default marked", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, teamPlatform(), makeStateStore())
      .getSuggestions(["/team "], 0, 6, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "minimal", label: "minimal", description: "1 agent" },
      { value: "alpha", label: "alpha", description: "(default)" },
      { value: "beta", label: "beta", description: "2 agents" },
    ]);
  });

  test("filters teams by the typed argument prefix", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, teamPlatform(), makeStateStore())
      .getSuggestions(["/team al"], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["alpha"]);
  });

  test("a fully typed team id yields no suggestions so Enter submits directly", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, teamPlatform(), makeStateStore())
      .getSuggestions(["/team alpha"], 0, 11, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("argument completion replaces only the argument token", () => {
    const result = new JieAutocompleteProviderImpl("/tmp", noScan, teamPlatform(), makeStateStore())
      .applyCompletion(["/team "], 0, 6, { value: "alpha", label: "alpha" }, "");
    expect(result.lines).toEqual(["/team alpha"]);
    expect(result.cursorCol).toBe(11);
  });
});

describe("createJieAutocompleteProvider — /resume arguments", () => {
  function sessionPlatform(): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "listSessions") {
        return [
          { sessionId: "alpha-1", messageCount: 3, lastActivity: "2026-07-22T00:00:00.000Z" },
          { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-21T00:00:00.000Z" },
        ];
      }
      return null;
    }));
  }

  test("suggests sessions after '/resume ' with message count and age", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume "], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["alpha-1", "beta-2"]);
    expect(suggestions!.items[0]!.description).toMatch(/^3 msg · /);
    expect(suggestions!.items[1]!.description).toMatch(/^12 msg · /);
  });

  function namedSessionPlatform(): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "listSessions") {
        return [
          { sessionId: "01HZX-ULID", name: "refactor pass", messageCount: 3, lastActivity: "2026-07-22T00:00:00.000Z" },
          { sessionId: "beta-2", messageCount: 12, lastActivity: "2026-07-21T00:00:00.000Z" },
        ];
      }
      return null;
    }));
  }

  test("filters sessions by the typed argument prefix", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume be"], 0, 10, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["beta-2"]);
  });

  test("shows a renamed session's name as the label, keeping the sessionId as the committed value", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, namedSessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume "], 0, 8, { signal: signal() });
    expect(suggestions!.items[0]!.label).toBe("refactor pass");
    expect(suggestions!.items[0]!.value).toBe("01HZX-ULID");
    expect(suggestions!.items[0]!.description).toMatch(/^3 msg · /);
    expect(suggestions!.items[1]!.label).toBe("beta-2");
  });

  test("filters sessions by name prefix in addition to session id", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, namedSessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume ref"], 0, 11, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["01HZX-ULID"]);
  });

  test("a fully typed session id yields no suggestions so Enter submits directly", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume alpha-1"], 0, 15, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when no team is loaded", async () => {
    const execute = vi.fn(async () => null);
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, makePlatform(execute), makeStateStore())
      .getSuggestions(["/resume "], 0, 8, { signal: signal() });
    expect(suggestions).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });
});

describe("createJieAutocompleteProvider — /effort arguments", () => {
  test("suggests the five effort levels after '/effort '", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["/effort "], 0, 8, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["off", "low", "medium", "high", "max"]);
  });

  test("filters effort levels by the typed prefix", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["/effort h"], 0, 9, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["high"]);
  });

  test("a fully typed effort level yields no suggestions so Enter submits directly", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["/effort high"], 0, 12, { signal: signal() });
    expect(suggestions).toBeNull();
  });
});

describe("createJieAutocompleteProvider — /model arguments", () => {
  const MODELS: ReadonlyArray<{ provider: string; id: string; name: string; available: boolean }> = [
    { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true },
    { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5", available: true },
    { provider: "openai", id: "gpt-5", name: "GPT-5", available: true },
  ];

  function modelPlatform(
    models: ReadonlyArray<{ provider: string; id: string; name: string; available: boolean }>,
    filters: ReadonlyArray<string> = [],
  ): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "listModels") return models;
      if (cmd.name === "getModelFilters") return filters;
      return null;
    }));
  }

  test("suggests registry models as provider/modelId with the model name as description", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "anthropic/claude-sonnet-4-5", label: "anthropic/claude-sonnet-4-5", description: "Claude Sonnet 4.5" },
      { value: "anthropic/claude-opus-4-5", label: "anthropic/claude-opus-4-5", description: "Claude Opus 4.5" },
      { value: "openai/gpt-5", label: "openai/gpt-5", description: "GPT-5" },
    ]);
  });

  test("filters models by the provider segment", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model anth"], 0, 11, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-5"]);
  });

  test("filters models across the provider/modelId boundary", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model anthropic/claude-o"], 0, 25, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-opus-4-5"]);
  });

  test("a fully typed provider/modelId yields no suggestions so Enter submits directly", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model openai/gpt-5"], 0, 19, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when no model matches", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model google/"], 0, 14, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when the registry lists no models", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform([]), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("caps the suggestion list at twenty entries", async () => {
    const many = Array.from({ length: 25 }, (_, index) => ({
      provider: "anthropic", id: `model-${index}`, name: `Model ${index}`, available: true,
    }));
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(many), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items).toHaveLength(20);
  });

  test("hides models whose provider is not available", async () => {
    const models = [
      { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true },
      { provider: "openai", id: "gpt-5", name: "GPT-5", available: false },
    ];
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(models), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-sonnet-4-5"]);
    expect(suggestions!.filteredOut).toBeUndefined();
  });

  test("applies model filters and reports how many models were filtered out", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS, ["gpt"]), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["openai/gpt-5"]);
    expect(suggestions!.filteredOut).toBe(2);
  });

  test("filter patterns match case-insensitively anywhere in provider/modelId", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS, ["CLAUDE"]), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic/claude-sonnet-4-5", "anthropic/claude-opus-4-5"]);
    expect(suggestions!.filteredOut).toBe(1);
  });

  test("omits filteredOut when no filter is set", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(MODELS), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.filteredOut).toBeUndefined();
  });
});

describe("createJieAutocompleteProvider — /login arguments", () => {
  const PROVIDERS: ReadonlyArray<{ id: string; description?: string }> = [
    { id: "my-local", description: "configured" },
    { id: "anthropic", description: "ANTHROPIC_API_KEY" },
    { id: "openai" },
  ];

  function providerPlatform(providers: ReadonlyArray<{ id: string; description?: string }>): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "listProviders") return providers;
      return null;
    }));
  }

  test("suggests providers with their descriptions after '/login '", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, providerPlatform(PROVIDERS), makeStateStore())
      .getSuggestions(["/login "], 0, 7, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["my-local", "anthropic", "openai"]);
    expect(suggestions!.items[0]!.description).toBe("configured");
    expect(suggestions!.items[1]!.description).toBe("ANTHROPIC_API_KEY");
    expect(suggestions!.items[2]!.description).toBeUndefined();
  });

  test("filters providers by the typed prefix", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, providerPlatform(PROVIDERS), makeStateStore())
      .getSuggestions(["/login an"], 0, 9, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["anthropic"]);
  });

  test("a fully typed provider yields no suggestions so Enter submits directly", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, providerPlatform(PROVIDERS), makeStateStore())
      .getSuggestions(["/login anthropic"], 0, 16, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("yields no suggestions when the registry lists no providers", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, providerPlatform([]), makeStateStore())
      .getSuggestions(["/login "], 0, 7, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("commits the bare provider id with no trailing space", () => {
    const result = new JieAutocompleteProviderImpl("/tmp", noScan, providerPlatform(PROVIDERS), makeStateStore())
      .applyCompletion(["/login "], 0, 7, { value: "anthropic", label: "anthropic" }, "");
    expect(result.lines).toEqual(["/login anthropic"]);
    expect(result.cursorCol).toBe(16);
  });
});

describe("createJieAutocompleteProvider — /logout arguments", () => {
  function logoutPlatform(): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "listProviders") {
        return [{ id: "anthropic", description: "ANTHROPIC_API_KEY" }, { id: "openai" }];
      }
      return null;
    }));
  }

  test("suggests the logout-all star first, then the providers", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, logoutPlatform(), makeStateStore())
      .getSuggestions(["/logout "], 0, 8, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "*", label: "*", description: "all providers" },
      { value: "anthropic", label: "anthropic", description: "ANTHROPIC_API_KEY" },
      { value: "openai", label: "openai" },
    ]);
  });

  test("a fully typed star yields no suggestions so Enter submits directly", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, logoutPlatform(), makeStateStore())
      .getSuggestions(["/logout *"], 0, 9, { signal: signal() });
    expect(suggestions).toBeNull();
  });
});
