import type { SkillInfo } from "../../platform";
import type { CompletionSource, JieSuggestions } from "./completion-source";
import { JieAutocompleteProviderImpl } from "./jie-autocomplete";
import { makeAgentUiState, makeTuiState } from "../test";
import {
  CWD,
  makeJieAutocompleteProvider,
  makePlatform,
  makeStateStore,
  noScan,
  nullPlatform,
  scanFixture,
  signal,
  storeWithTeam,
} from "./_test-fixtures";

function skillInfo(name: string, overrides: Partial<SkillInfo> = {}): SkillInfo {
  return { name, description: `run ${name}`, argumentHint: null, ...overrides };
}

function storeWithSkills(skills: ReadonlyArray<SkillInfo>) {
  const agent = makeAgentUiState("my-team:general-1", { isLeader: true, skills });
  return makeStateStore(makeTuiState({
    teamId: "my-team",
    leaderAgentId: agent.agentId,
    focusedAgentId: agent.agentId,
    agents: new Map([[agent.agentId, agent]]),
  }));
}

function drillPlatform() {
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

describe("JieAutocompleteProviderImpl", () => {
  test("plain text yields no suggestions", async () => {
    const suggestions = await makeJieAutocompleteProvider("/tmp", noScan, nullPlatform(), makeStateStore())
      .getSuggestions(["hello"], 0, 5, { signal: signal() });
    expect(suggestions).toBeNull();
  });

  test("merges slash commands and skills for bare '/'", async () => {
    const suggestions = await makeJieAutocompleteProvider("/tmp", noScan, nullPlatform(), storeWithSkills([skillInfo("say-hello")]))
      .getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions).not.toBeNull();
    expect(suggestions!.items).toHaveLength(17);
    expect(suggestions!.items.at(-1)).toEqual({ value: "skill:say-hello", label: "skill:say-hello", description: "run say-hello" });
  });

  test("short-circuits on an exclusive source and skips later sources", async () => {
    class ExclusiveSource implements CompletionSource {
      readonly triggerCharacters = ["/"];
      readonly exclusive = true;
      getSuggestions(_lines: string[], _cursorLine: number, _cursorCol: number, _options: { signal: AbortSignal; force?: boolean }): Promise<JieSuggestions | null> {
        return Promise.resolve({ items: [{ value: "exclusive", label: "exclusive" }], prefix: "/" });
      }
    }

    class TrackingSource implements CompletionSource {
      readonly triggerCharacters = ["/"];
      called = false;
      getSuggestions(_lines: string[], _cursorLine: number, _cursorCol: number, _options: { signal: AbortSignal; force?: boolean }): Promise<JieSuggestions | null> {
        this.called = true;
        return Promise.resolve({ items: [{ value: "track", label: "track" }], prefix: "/" });
      }
    }

    const tracking = new TrackingSource();
    const provider = new JieAutocompleteProviderImpl("/tmp", [new ExclusiveSource(), tracking]);
    const suggestions = await provider.getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions!.items).toEqual([{ value: "exclusive", label: "exclusive" }]);
    expect(tracking.called).toBe(false);
  });

  test("applyCompletion replaces an @-mention token with the resolved path and a trailing space", () => {
    const result = makeJieAutocompleteProvider(CWD, scanFixture, nullPlatform(), makeStateStore())
      .applyCompletion(["@mai"], 0, 4, { value: "@src/main.ts", label: "src/main.ts" }, "@mai");
    expect(result.lines).toEqual(["@src/main.ts "]);
    expect(result.cursorCol).toBe(13);
  });

  test("applyCompletion appends a slash command and a trailing space", () => {
    const result = makeJieAutocompleteProvider("/tmp", noScan, nullPlatform(), makeStateStore())
      .applyCompletion(["/he"], 0, 3, { value: "help", label: "help" }, "/he");
    expect(result.lines).toEqual(["/help "]);
    expect(result.cursorCol).toBe(6);
  });

  test("applyCompletion inserts a skill invocation and a trailing space", () => {
    const result = makeJieAutocompleteProvider("/tmp", noScan, nullPlatform(), storeWithSkills([skillInfo("say-hello")]))
      .applyCompletion(["/skill:say"], 0, 10, { value: "skill:say-hello", label: "skill:say-hello" }, "/skill:say");
    expect(result.lines).toEqual(["/skill:say-hello "]);
    expect(result.cursorCol).toBe(17);
  });

  test("applyCompletion commits a drill-down '/command arg' with a trailing space", () => {
    const result = makeJieAutocompleteProvider("/tmp", noScan, drillPlatform(), storeWithTeam())
      .applyCompletion(["/resum"], 0, 6, { value: "resume alpha-1", label: "resume alpha-1" }, "/resum");
    expect(result.lines).toEqual(["/resume alpha-1 "]);
    expect(result.cursorCol).toBe(16);
  });
});
