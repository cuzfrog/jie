import { fuzzyFilter, type AutocompleteItem } from "@earendil-works/pi-tui";
import type { CommandCatalog, CommandMeta, CommandResolver } from "../command";
import type { StateStore } from "../state";
import type { CompletionSource, JieSuggestions } from "./completion-source";

interface CommandEntry {
  readonly name: string;
  readonly canonicalName: string;
  readonly description: string;
  readonly argumentHint?: string;
  readonly isAlias: boolean;
}

export class SlashCommandSource implements CompletionSource {
  readonly triggerCharacters = ["/"];
  private readonly commandEntries: CommandEntry[];

  constructor(
    commandCatalog: CommandCatalog,
    private readonly commandResolver: CommandResolver,
    private readonly stateStore: StateStore,
  ) {
    this.commandEntries = buildCommandEntries(commandCatalog);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    _options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
    if (!textBeforeCursor.startsWith("/")) return null;

    const spaceIndex = textBeforeCursor.indexOf(" ");
    const state = this.stateStore.getState();

    if (spaceIndex === -1) {
      const query = textBeforeCursor.slice(1);
      const matches = fuzzyFilter(this.commandEntries, query, (entry) => entry.name);
      if (matches.length === 0) return null;

      if (matches.length === 1) {
        const matched = matches[0]!;
        const completion = await Promise.resolve(this.commandResolver.complete(state, matched.name, ""));
        if (completion !== null && completion.items.length > 0) {
          return {
            items: completion.items.map((item) => ({
              value: `${matched.name} ${item.value}`,
              label: `${matched.name} ${item.label}`,
              description: item.description,
            })),
            prefix: textBeforeCursor,
            filteredOut: completion.filteredOut,
          };
        }
      }

      return {
        items: matches.map((entry) => ({
          value: entry.name,
          label: entry.name,
          description: formatCommandDescription(entry),
        })),
        prefix: textBeforeCursor,
      };
    }

    const commandName = textBeforeCursor.slice(1, spaceIndex);
    const argumentText = textBeforeCursor.slice(spaceIndex + 1);
    const completion = await Promise.resolve(this.commandResolver.complete(state, commandName, argumentText));
    if (completion === null || completion.items.length === 0) return null;

    return {
      items: completion.items.map((item): AutocompleteItem => ({
        value: item.value,
        label: item.label,
        description: item.description,
      })),
      prefix: argumentText,
      filteredOut: completion.filteredOut,
    };
  }
}

function buildCommandEntries(commandCatalog: CommandCatalog): CommandEntry[] {
  return commandCatalog.metadata.flatMap((meta) => [
    toCommandEntry(meta, false),
    ...(meta.aliases ?? []).map((alias) => toCommandEntry(meta, true, alias)),
  ]);
}

function toCommandEntry(meta: CommandMeta, isAlias: boolean, alias?: string): CommandEntry {
  return {
    name: isAlias && alias !== undefined ? alias : meta.name,
    canonicalName: meta.name,
    description: isAlias ? `alias of /${meta.name}` : meta.description,
    argumentHint: isAlias ? undefined : meta.argumentHint,
    isAlias,
  };
}

function formatCommandDescription(entry: CommandEntry): string {
  const hint = entry.argumentHint;
  const desc = entry.description;
  return hint ? (desc ? `${hint} — ${desc}` : hint) : desc;
}
