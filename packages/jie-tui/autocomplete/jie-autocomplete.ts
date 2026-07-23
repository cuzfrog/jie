import {
  CombinedAutocompleteProvider,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from "@earendil-works/pi-tui";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import { SLASH_COMMAND_NAMES } from "../command-handler";
import { filterFiles, scanFiles } from "../file-mention";
import type { StateStore } from "../state";

const MAX_SUGGESTIONS = 20;
const AT_PREFIX_PATTERN = /(?:^|[\s"])@([\w./-]*)$/;

export class JieAutocompleteProviderImpl implements AutocompleteProvider {
  readonly triggerCharacters = ["@", "/"];
  private readonly cwd: string;
  private readonly combined: CombinedAutocompleteProvider;

  constructor(cwd: string, platform: JiePlatform, stateStore: StateStore) {
    this.cwd = cwd;
    this.combined = new CombinedAutocompleteProvider(slashCommands(platform, stateStore), cwd, null);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<AutocompleteSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
    const query = atQuery(textBeforeCursor);
    if (query === null) return this.combined.getSuggestions(lines, cursorLine, cursorCol, options);
    const items = fileItems(query, this.cwd);
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
  return SLASH_COMMAND_NAMES.map((name): SlashCommand => {
    if (name === "team") return { name, getArgumentCompletions: (prefix) => teamItems(platform, prefix) };
    if (name === "resume") return { name, getArgumentCompletions: (prefix) => sessionItems(platform, stateStore, prefix) };
    return { name };
  });
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
    .filter((session) => hasPrefix(session.sessionId, prefix))
    .slice(0, MAX_SUGGESTIONS)
    .map((session): AutocompleteItem => ({
      value: session.sessionId,
      label: session.sessionId,
      description: `${session.messageCount} msg · ${relativeAge(session.lastActivity)}`,
    }));
  return items.length === 0 ? null : items;
}

function atQuery(textBeforeCursor: string): string | null {
  const match = AT_PREFIX_PATTERN.exec(textBeforeCursor);
  return match === null ? null : (match[1] ?? "");
}

function fileItems(query: string, basePath: string): AutocompleteItem[] {
  const entries = filterFiles(query, scanFiles(basePath).map((file) => ({ path: file.relPath })));
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
