import {
  CombinedAutocompleteProvider,
  fuzzyFilter,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from "@earendil-works/pi-tui";
import { EFFORT_LEVELS, type JiePlatform } from "@cuzfrog/jie-platform";
import { COMMAND_METADATA } from "../command-metadata";
import { filterFiles, type ScannedFile } from "../file-mention";
import type { StateStore } from "../state";

const MAX_SUGGESTIONS = 20;
const AT_PREFIX_PATTERN = /(?:^|[\s"])@([\w./-]*)$/;

export class JieAutocompleteProviderImpl implements AutocompleteProvider {
  readonly triggerCharacters = ["@", "/"];
  private readonly cwd: string;
  private readonly scan: (rootDir: string) => ReadonlyArray<ScannedFile>;
  private readonly commands: SlashCommand[];
  private readonly combined: CombinedAutocompleteProvider;

  constructor(cwd: string, scan: (rootDir: string) => ReadonlyArray<ScannedFile>, platform: JiePlatform, stateStore: StateStore) {
    this.cwd = cwd;
    this.scan = scan;
    this.commands = slashCommands(platform, stateStore);
    this.combined = new CombinedAutocompleteProvider(this.commands, cwd, null);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
    const query = atQuery(textBeforeCursor);
    if (query === null) {
      const drillDown = await drillDownSuggestions(this.commands, textBeforeCursor);
      return drillDown ?? this.combined.getSuggestions(lines, cursorLine, cursorCol, options);
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
}

function slashCommands(platform: JiePlatform, stateStore: StateStore): SlashCommand[] {
  return COMMAND_METADATA.map((meta): SlashCommand => {
    if (meta.name === "team") return { ...meta, getArgumentCompletions: (prefix) => teamItems(platform, prefix) };
    if (meta.name === "resume") return { ...meta, getArgumentCompletions: (prefix) => sessionItems(platform, stateStore, prefix) };
    if (meta.name === "model") return { ...meta, getArgumentCompletions: (prefix) => modelItems(platform, prefix) };
    if (meta.name === "login") return { ...meta, getArgumentCompletions: (prefix) => providerItems(platform, prefix) };
    if (meta.name === "effort") return { ...meta, getArgumentCompletions: async (prefix) => effortItems(prefix) };
    return { ...meta };
  });
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
  if (isAlreadyComplete(info.installed, prefix)) return null;
  const items = info.installed
    .filter((teamId) => hasPrefix(teamId, prefix))
    .slice(0, MAX_SUGGESTIONS)
    .map((teamId): AutocompleteItem => teamId === info.defaultTeam
      ? { value: teamId, label: teamId, description: "(default)" }
      : { value: teamId, label: teamId });
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

async function modelItems(platform: JiePlatform, prefix: string): Promise<AutocompleteItem[] | null> {
  const models = await platform.execute({ name: "listModels" });
  const items = models.map((model): AutocompleteItem => {
    const value = `${model.provider}/${model.id}`;
    return { value, label: value, description: model.name };
  });
  if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
  const matches = items.filter((item) => hasPrefix(item.label, prefix)).slice(0, MAX_SUGGESTIONS);
  return matches.length === 0 ? null : matches;
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
