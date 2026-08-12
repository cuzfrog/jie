import type { SkillInfo } from "../../platform";
import { makeAgentUiState, makeTuiState } from "../test";
import type { StateStore } from "../state";
import { SkillSource } from "./skill-source";
import { makeStateStore, signal } from "./_test-fixtures";

describe("SkillSource", () => {
  function skillInfo(name: string, overrides: Partial<SkillInfo> = {}): SkillInfo {
    return { name, description: `run ${name}`, argumentHint: null, ...overrides };
  }

  function storeWithSkills(skills: ReadonlyArray<SkillInfo>): StateStore {
    const agent = makeAgentUiState("my-team:general-1", { isLeader: true, skills });
    return makeStateStore(makeTuiState({
      teamId: "my-team",
      leaderAgentId: agent.agentId,
      focusedAgentId: agent.agentId,
      agents: new Map([[agent.agentId, agent]]),
    }));
  }

  test("bare '/' lists the focused agent's skills", async () => {
    const suggestions = await new SkillSource(storeWithSkills([skillInfo("say-hello")])).getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions!.items).toHaveLength(1);
    expect(suggestions!.items.at(-1)).toEqual({ value: "skill:say-hello", label: "skill:say-hello", description: "run say-hello" });
  });

  test("skill rows show the argument hint before the description", async () => {
    const store = storeWithSkills([skillInfo("deploy", { argumentHint: "<env>", description: "deploys the app" })]);
    const suggestions = await new SkillSource(store).getSuggestions(["/skill:"], 0, 7, { signal: signal() });
    expect(suggestions!.items[0]!.description).toBe("<env> — deploys the app");
  });

  test("'/skill:' lists the focused agent's skills", async () => {
    const suggestions = await new SkillSource(storeWithSkills([skillInfo("say-hello"), skillInfo("deploy")])).getSuggestions(["/skill:"], 0, 7, { signal: signal() });
    expect(suggestions!.prefix).toBe("/skill:");
    expect(suggestions!.items.map((item) => item.value)).toEqual(["skill:say-hello", "skill:deploy"]);
  });

  test("'/skill:say' filters skills by the typed prefix", async () => {
    const suggestions = await new SkillSource(storeWithSkills([skillInfo("say-hello"), skillInfo("deploy")])).getSuggestions(["/skill:say"], 0, 10, { signal: signal() });
    expect(suggestions!.prefix).toBe("/skill:say");
    expect(suggestions!.items.map((item) => item.value)).toEqual(["skill:say-hello"]);
  });

  test("an agent without skills contributes no skill entries", async () => {
    const suggestions = await new SkillSource(storeWithSkills([])).getSuggestions(["/"], 0, 1, { signal: signal() });
    expect(suggestions).toBeNull();
    const filtered = await new SkillSource(storeWithSkills([])).getSuggestions(["/skill:"], 0, 7, { signal: signal() });
    expect(filtered).toBeNull();
  });

  test("no team loaded yields no skill entries", async () => {
    const suggestions = await new SkillSource(makeStateStore()).getSuggestions(["/skill:"], 0, 7, { signal: signal() });
    expect(suggestions).toBeNull();
  });
});
