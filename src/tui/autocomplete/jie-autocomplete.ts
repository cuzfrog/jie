import { CombinedAutocompleteProvider, fuzzyFilter, type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions, type SlashCommand } from "@earendil-works/pi-tui";
import type { JiePlatform, SkillInfo } from "../../platform";
import type { CommandRegistry, SlashCommandDefinition } from "../command";
import { filterFiles, type ScannedFile } from "../file-mention";
import type { StateStore } from "../state";

const MAX_SUGGESTIONS = 20;
const AT_PREFIX_PATTERN = /(?:^|[\s"])@([\w./-]*)$/;

export interface JieSuggestions extends AutocompleteSuggestions {
  readonly filteredOut?: number;
}

export interface JieAutocompleteProvider extends AutocompleteProvider {
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null>;
}

export class JieAutocompleteProviderImpl implements JieAutocompleteProvider {
  readonly triggerCharacters = ["@", "/"];
  private readonly cwd: string;
  private readonly scan: (rootDir: string) => ReadonlyArray<ScannedFile>;
  private readonly stateStore: StateStore;
  private readonly commands: SlashCommand[];
  private readonly combined: CombinedAutocompleteProvider;
  private modelFilteredOutCount: number | null = null;

  constructor(
    cwd: string,
    scan: (rootDir: string) => ReadonlyArray<ScannedFile>,
    platform: JiePlatform,
    stateStore: StateStore,
    commandRegistry: CommandRegistry,
  ) {
    this.cwd = cwd;
    this.scan = scan;
    this.stateStore = stateStore;
    this.commands = buildSlashCommands(commandRegistry.commands, platform, stateStore, (count) => {
      this.modelFilteredOutCount = count;
    });
    this.combined = new CombinedAutocompleteProvider(this.commands, cwd, null);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    this.modelFilteredOutCount = null;
    const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
    const query = atQuery(textBeforeCursor);
    if (query === null) {
      const drillDown = await drillDownSuggestions(this.commands, textBeforeCursor);
      if (drillDown !== null) return withFilteredOut(drillDown, this.modelFilteredOutCount);
      const combined = await this.combined.getSuggestions(lines, cursorLine, cursorCol, options);
      const skills = this.skillSuggestions(textBeforeCursor);
      if (skills === null) return withFilteredOut(combined, this.modelFilteredOutCount);
      if (combined === null) return withFilteredOut(skills, this.modelFilteredOutCount);
      return withFilteredOut({ items: [...combined.items, ...skills.items], prefix: combined.prefix }, this.modelFilteredOutCount);
    }
    const items = fileItems(query, this.scan, this.cwd);
    if (items.length === 0) return null;
    return { items, prefix: `@${query}` };
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    return this.combined.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }

  private skillSuggestions(textBeforeCursor: string): AutocompleteSuggestions | null {
    if (!textBeforeCursor.startsWith("/") || /\s/.test(textBeforeCursor)) return null;
    const query = textBeforeCursor.slice(1);
    const skills = targetAgentSkills(this.stateStore);
    if (skills.length === 0 || isAlreadyComplete(skills.map((skill) => `skill:${skill.name}`), query)) return null;
    const matches = fuzzyFilter([...skills], query, (skill) => `skill:${skill.name}`).slice(0, MAX_SUGGESTIONS);
    if (matches.length === 0) return null;
    return {
      items: matches.map((skill): AutocompleteItem => ({
        value: `skill:${skill.name}`,
        label: `skill:${skill.name}`,
        description: skill.argumentHint !== null ? `${skill.argumentHint} — ${skill.description}` : skill.description,
      })),
      prefix: textBeforeCursor,
    };
  }
}

function buildSlashCommands(
  definitions: ReadonlyArray<SlashCommandDefinition>,
  platform: JiePlatform,
  stateStore: StateStore,
  reportFilteredOut: (count: number) => void,
): SlashCommand[] {
  const commands: SlashCommand[] = [];
  for (const definition of definitions) {
    const canonical = toSlashCommand(definition, platform, stateStore, reportFilteredOut);
    commands.push(canonical);
    for (const alias of definition.meta.aliases ?? []) {
      commands.push({
        name: alias,
        description: `alias of /${canonical.name}`,
        argumentHint: canonical.argumentHint,
        getArgumentCompletions: canonical.getArgumentCompletions,
      });
    }
  }
  return commands;
}

function toSlashCommand(
  definition: SlashCommandDefinition,
  platform: JiePlatform,
  stateStore: StateStore,
  reportFilteredOut: (count: number) => void,
): SlashCommand {
  return {
    name: definition.meta.name,
    description: definition.meta.description,
    argumentHint: definition.meta.argumentHint,
    getArgumentCompletions: async (argumentText: string): Promise<AutocompleteItem[] | null> => {
      const completion = await Promise.resolve(definition.complete(argumentText, { state: stateStore.getState(), platform }));
      if (completion === null) return null;
      if (completion.filteredOut !== undefined && completion.filteredOut > 0) {
        reportFilteredOut(completion.filteredOut);
      }
      return completion.items.map((item): AutocompleteItem => ({
        value: item.value,
        label: item.label,
        description: item.description,
      }));
    },
  };
}

async function drillDownSuggestions(commands: SlashCommand[], textBeforeCursor: string): Promise<AutocompleteSuggestions | null> {
  if (!textBeforeCursor.startsWith("/") || textBeforeCursor.includes(" ")) return null;
  const query = textBeforeCursor.slice(1);
  if (query === "") return null;
  const matches = fuzzyFilter(commands, query, (command) => command.name);
  if (matches.length !== 1) return null;
  const command = matches[0];
  if (command.getArgumentCompletions === undefined) return null;
  const argumentItems = await command.getArgumentCompletions("");
  if (argumentItems === null || argumentItems.length === 0) return null;
  return {
    items: argumentItems.map((item): AutocompleteItem => ({
      value: `${command.name} ${item.value}`,
      label: `${command.name} ${item.label}`,
      description: item.description,
    })),
    prefix: textBeforeCursor,
  };
}

function fileItems(query: string, scan: (rootDir: string) => ReadonlyArray<ScannedFile>, basePath: string): AutocompleteItem[] {
  const entries = filterFiles(query, scan(basePath).map((file) => ({ path: file.relPath })));
  return entries.slice(0, MAX_SUGGESTIONS).map((entry): AutocompleteItem => ({ value: `@${entry.path}`, label: entry.path }));
}

function targetAgentSkills(stateStore: StateStore): ReadonlyArray<SkillInfo> {
  const state = stateStore.getState();
  for (const agentId of [state.focusedAgentId, state.leaderAgentId]) {
    if (agentId === null) continue;
    const agent = state.agents.get(agentId);
    if (agent !== undefined) return agent.skills;
  }
  return [];
}

function withFilteredOut(suggestions: AutocompleteSuggestions | null, filteredOut: number | null): JieSuggestions | null {
  if (suggestions === null) return null;
  return filteredOut === null || filteredOut === 0 ? suggestions : { ...suggestions, filteredOut };
}

function atQuery(textBeforeCursor: string): string | null {
  const match = AT_PREFIX_PATTERN.exec(textBeforeCursor);
  return match === null ? null : (match[1] ?? "");
}

function isAlreadyComplete(candidates: ReadonlyArray<string>, prefix: string): boolean {
  return prefix !== "" && candidates.some((candidate) => candidate.toLowerCase() === prefix.toLowerCase());
}
