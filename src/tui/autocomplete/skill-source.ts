import { fuzzyFilter } from "@earendil-works/pi-tui";
import type { SkillInfo } from "../../platform";
import type { StateStore } from "../state";
import type { CompletionSource, JieSuggestions } from "./completion-source";

const MAX_SUGGESTIONS = 20;

export class SkillSource implements CompletionSource {
  readonly triggerCharacters = ["/"];

  constructor(private readonly stateStore: StateStore) {}

  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    _options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
    if (!textBeforeCursor.startsWith("/") || /\s/.test(textBeforeCursor)) return Promise.resolve(null);
    const query = textBeforeCursor.slice(1);
    const skills = this.targetAgentSkills();
    const candidates = skills.map((skill) => `skill:${skill.name}`);
    if (skills.length === 0 || isAlreadyComplete(candidates, query)) return Promise.resolve(null);
    const matches = fuzzyFilter([...skills], query, (skill) => `skill:${skill.name}`).slice(0, MAX_SUGGESTIONS);
    if (matches.length === 0) return Promise.resolve(null);
    return Promise.resolve({
      items: matches.map((skill) => ({
        value: `skill:${skill.name}`,
        label: `skill:${skill.name}`,
        description: skill.argumentHint !== null ? `${skill.argumentHint} — ${skill.description}` : skill.description,
      })),
      prefix: textBeforeCursor,
    });
  }

  private targetAgentSkills(): ReadonlyArray<SkillInfo> {
    const state = this.stateStore.getState();
    for (const agentId of [state.focusedAgentId, state.leaderAgentId]) {
      if (agentId === null) continue;
      const agent = state.agents.get(agentId);
      if (agent !== undefined) return agent.skills;
    }
    return [];
  }
}

function isAlreadyComplete(candidates: ReadonlyArray<string>, prefix: string): boolean {
  return prefix !== "" && candidates.some((candidate) => candidate.toLowerCase() === prefix.toLowerCase());
}
