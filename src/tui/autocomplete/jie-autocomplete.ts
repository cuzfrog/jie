import {
  CombinedAutocompleteProvider,
  fuzzyFilter,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from "@earendil-works/pi-tui";
import { EFFORT_LEVELS, type JiePlatform, type KanbanCard, type SkillInfo } from "../../platform";
import { COMMAND_METADATA } from "../command-metadata";
import { filterFiles, type ScannedFile } from "../file-mention";
import type { StateStore } from "../state";

const MAX_SUGGESTIONS = 20;
const AT_PREFIX_PATTERN = /(?:^|[\s"])@([\w./-]*)$/;
const MODEL_FILTER_ACTIONS = ["add", "remove", "list"] as const;

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

  constructor(cwd: string, scan: (rootDir: string) => ReadonlyArray<ScannedFile>, platform: JiePlatform, stateStore: StateStore) {
    this.cwd = cwd;
    this.scan = scan;
    this.stateStore = stateStore;
    this.commands = slashCommands(platform, stateStore, (count) => {
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

function slashCommands(
  platform: JiePlatform,
  stateStore: StateStore,
  reportModelFilteredOut: (count: number) => void,
): SlashCommand[] {
  const commands: SlashCommand[] = [];
  for (const meta of COMMAND_METADATA) {
    const canonical = slashCommandFor(platform, stateStore, reportModelFilteredOut, meta);
    commands.push(canonical);
    for (const alias of meta.aliases ?? []) {
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

function slashCommandFor(
  platform: JiePlatform,
  stateStore: StateStore,
  reportModelFilteredOut: (count: number) => void,
  meta: (typeof COMMAND_METADATA)[number],
): SlashCommand {
  if (meta.name === "team") return { ...meta, getArgumentCompletions: (prefix) => teamItems(platform, prefix) };
  if (meta.name === "resume") return { ...meta, getArgumentCompletions: (prefix) => sessionItems(platform, stateStore, prefix) };
  if (meta.name === "model") return { ...meta, getArgumentCompletions: (prefix) => modelItems(platform, prefix, reportModelFilteredOut) };
  if (meta.name === "model-filter") return { ...meta, getArgumentCompletions: (argumentText) => modelFilterItems(platform, argumentText) };
  if (meta.name === "login") return { ...meta, getArgumentCompletions: (prefix) => providerItems(platform, prefix) };
  if (meta.name === "logout") return { ...meta, getArgumentCompletions: (prefix) => logoutItems(platform, prefix) };
  if (meta.name === "effort") return { ...meta, getArgumentCompletions: async (prefix) => effortItems(prefix) };
  if (meta.name === "kanban") return { ...meta, getArgumentCompletions: (argumentText) => kanbanItems(stateStore, argumentText) };
  return { ...meta };
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

async function teamItems(platform: JiePlatform, prefix: string): Promise<AutocompleteItem[] | null> {
  const info = await platform.execute({ name: "getTeamInfo" });
  if (isAlreadyComplete(info.installed.map((team) => team.id), prefix)) return null;
  const items = info.installed
    .filter((team) => hasPrefix(team.id, prefix))
    .slice(0, MAX_SUGGESTIONS)
    .map((team): AutocompleteItem => ({
      value: team.id,
      label: team.id,
      description: team.id === info.defaultTeam ? "(default)" : team.agentCount === 1 ? "1 agent" : `${team.agentCount} agents`,
    }));
  return items.length === 0 ? null : items;
}

async function sessionItems(platform: JiePlatform, stateStore: StateStore, prefix: string): Promise<AutocompleteItem[] | null> {
  const teamId = stateStore.getState().teamId;
  if (teamId === null) return null;
  const sessions = await platform.execute({ name: "listSessions", teamId });
  if (isAlreadyComplete(sessions.map((session) => session.sessionId), prefix)) return null;
  const items = sessions
    .filter((session) => hasPrefix(session.sessionId, prefix) || (session.name !== undefined && hasPrefix(session.name, prefix)))
    .slice(0, MAX_SUGGESTIONS)
    .map((session): AutocompleteItem => ({
      value: session.sessionId,
      label: session.name ?? session.sessionId,
      description: `${session.messageCount} msg · ${relativeAge(session.lastActivity)}`,
    }));
  return items.length === 0 ? null : items;
}

async function modelItems(
  platform: JiePlatform,
  prefix: string,
  reportFilteredOut: (count: number) => void,
): Promise<AutocompleteItem[] | null> {
  const filtered = await platform.execute({ name: "listFilteredModels" });
  if (filtered.filteredOut > 0) reportFilteredOut(filtered.filteredOut);
  const items = filtered.models.map((model): AutocompleteItem => {
    const value = `${model.provider}/${model.id}`;
    return { value, label: value, description: model.name };
  });
  if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
  const matches = items.filter((item) => hasPrefix(item.label, prefix)).slice(0, MAX_SUGGESTIONS);
  return matches.length === 0 ? null : matches;
}

async function logoutItems(platform: JiePlatform, prefix: string): Promise<AutocompleteItem[] | null> {
  const providers = await platform.execute({ name: "listProviders" });
  const items: AutocompleteItem[] = [
    { value: "*", label: "*", description: "all providers" },
    ...providers.map((provider): AutocompleteItem => ({ value: provider.id, label: provider.id, description: provider.description })),
  ];
  if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
  const matches = items.filter((item) => hasPrefix(item.label, prefix)).slice(0, MAX_SUGGESTIONS);
  return matches.length === 0 ? null : matches;
}

async function modelFilterItems(platform: JiePlatform, argumentText: string): Promise<AutocompleteItem[] | null> {
  const spaceIndex = argumentText.indexOf(" ");
  if (spaceIndex === -1) {
    if (argumentText.toLowerCase() === "remove") return removePatternItems(platform, "");
    if (isAlreadyComplete(MODEL_FILTER_ACTIONS, argumentText)) return null;
    const items = MODEL_FILTER_ACTIONS.filter((action) => hasPrefix(action, argumentText))
      .map((action): AutocompleteItem => ({ value: action, label: action }));
    return items.length === 0 ? null : items;
  }
  const action = argumentText.slice(0, spaceIndex);
  if (action !== "remove") return null;
  return removePatternItems(platform, argumentText.slice(spaceIndex + 1));
}

async function removePatternItems(platform: JiePlatform, pattern: string): Promise<AutocompleteItem[] | null> {
  const filters = await platform.execute({ name: "getModelFilters" });
  if (isAlreadyComplete(filters, pattern)) return null;
  const items = filters
    .filter((filter) => hasPrefix(filter, pattern))
    .slice(0, MAX_SUGGESTIONS)
    .map((filter): AutocompleteItem => ({ value: `remove ${filter}`, label: filter }));
  return items.length === 0 ? null : items;
}

async function providerItems(platform: JiePlatform, prefix: string): Promise<AutocompleteItem[] | null> {
  const providers = await platform.execute({ name: "listProviders" });
  const items = providers.map((provider): AutocompleteItem =>
    ({ value: provider.id, label: provider.id, description: provider.description }));
  if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
  const matches = items.filter((item) => hasPrefix(item.label, prefix)).slice(0, MAX_SUGGESTIONS);
  return matches.length === 0 ? null : matches;
}

function effortItems(prefix: string): AutocompleteItem[] | null {
  if (isAlreadyComplete(EFFORT_LEVELS, prefix)) return null;
  const items = EFFORT_LEVELS
    .filter((level) => hasPrefix(level, prefix))
    .map((level): AutocompleteItem => ({ value: level, label: level }));
  return items.length === 0 ? null : items;
}

const KANBAN_SUBCOMMANDS: ReadonlyArray<{ readonly name: string; readonly description: string }> = [
  { name: "add", description: "[--title <title>] <description>" },
  { name: "remove", description: "<cardId>" },
  { name: "complete", description: "<cardId>" },
  { name: "review", description: "<cardId>" },
];

function kanbanItems(stateStore: StateStore, argumentText: string): AutocompleteItem[] | null {
  const state = stateStore.getState();
  const board = state.kanban.board;
  const trimmed = argumentText.trim();
  if (trimmed === "") return KANBAN_SUBCOMMANDS.map(subcommandItem);
  const spaceIndex = trimmed.indexOf(" ");
  const subcommand = spaceIndex === -1 ? trimmed : trimmed.slice(0, spaceIndex);
  const rest = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1);
  if (subcommand.toLowerCase() === "add") return null;
  if (subcommand.toLowerCase() === "remove" || subcommand.toLowerCase() === "complete" || subcommand.toLowerCase() === "review") {
    const targetStatus = subcommand.toLowerCase() === "complete" ? "completed" : subcommand.toLowerCase() === "review" ? "in_review" : null;
    const cards = board.filter((card) => hasPrefix(card.id, rest) && (targetStatus === null || card.status !== targetStatus));
    if (cards.length === 0) return null;
    return cards.map((card) => kanbanCardItem(card, subcommand));
  }
  const matches = KANBAN_SUBCOMMANDS.filter((item) => hasPrefix(item.name, subcommand));
  if (matches.length === 0) return null;
  return matches.map(subcommandItem);
}

function subcommandItem(item: { readonly name: string; readonly description: string }): AutocompleteItem {
  return { value: item.name, label: item.name, description: item.description };
}

function kanbanCardItem(card: KanbanCard, subcommand: string): AutocompleteItem {
  return { value: `${subcommand} ${card.id}`, label: card.id, description: card.content };
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

function fileItems(query: string, scan: (rootDir: string) => ReadonlyArray<ScannedFile>, basePath: string): AutocompleteItem[] {
  const entries = filterFiles(query, scan(basePath).map((file) => ({ path: file.relPath })));
  return entries.slice(0, MAX_SUGGESTIONS).map((entry): AutocompleteItem => ({ value: `@${entry.path}`, label: entry.path }));
}

function hasPrefix(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function isAlreadyComplete(candidates: ReadonlyArray<string>, prefix: string): boolean {
  return prefix !== "" && candidates.some((candidate) => candidate.toLowerCase() === prefix.toLowerCase());
}

function relativeAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
