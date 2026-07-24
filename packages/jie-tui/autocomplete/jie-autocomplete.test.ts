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
});

describe("createJieAutocompleteProvider — /team arguments", () => {
  function teamPlatform(): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "getTeamInfo") return { defaultTeam: "alpha", installed: ["minimal", "alpha", "beta"] };
      return null;
    }));
  }

  test("suggests installed teams after '/team ' with the default marked", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, teamPlatform(), makeStateStore())
      .getSuggestions(["/team "], 0, 6, { signal: signal() });
    expect(suggestions!.items).toEqual([
      { value: "minimal", label: "minimal" },
      { value: "alpha", label: "alpha", description: "(default)" },
      { value: "beta", label: "beta" },
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

  test("filters sessions by the typed argument prefix", async () => {
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, sessionPlatform(), storeWithTeam())
      .getSuggestions(["/resume be"], 0, 10, { signal: signal() });
    expect(suggestions!.items.map((item) => item.value)).toEqual(["beta-2"]);
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
  const MODELS = [
    { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5" },
    { provider: "openai", id: "gpt-5", name: "GPT-5" },
  ];

  function modelPlatform(models: ReadonlyArray<{ provider: string; id: string; name: string }>): JiePlatform {
    return makePlatform(vi.fn(async (cmd: { name: string }) => {
      if (cmd.name === "listModels") return models;
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
    const many = Array.from({ length: 25 }, (_, index) => ({ provider: "anthropic", id: `model-${index}`, name: `Model ${index}` }));
    const suggestions = await new JieAutocompleteProviderImpl("/tmp", noScan, modelPlatform(many), makeStateStore())
      .getSuggestions(["/model "], 0, 7, { signal: signal() });
    expect(suggestions!.items).toHaveLength(20);
  });
});
