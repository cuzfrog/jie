import {
  CombinedAutocompleteProvider,
  type AutocompleteItem,
  type AutocompleteProvider,
  type AutocompleteSuggestions,
  type SlashCommand,
} from "@earendil-works/pi-tui";
import { SLASH_COMMAND_NAMES } from "../command-handler";
import { filterFiles, scanFiles } from "../file-mention";

const MAX_SUGGESTIONS = 20;
const AT_PREFIX_PATTERN = /(?:^|[\s"])@([\w./-]*)$/;

export function createJieAutocompleteProvider(basePath: string): AutocompleteProvider {
  const combined = new CombinedAutocompleteProvider(slashCommands(), basePath, null);
  return {
    triggerCharacters: ["@", "/"],
    async getSuggestions(lines, cursorLine, cursorCol, options): Promise<AutocompleteSuggestions | null> {
      const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const query = atQuery(textBeforeCursor);
      if (query === null) return combined.getSuggestions(lines, cursorLine, cursorCol, options);
      const items = fileItems(query, basePath);
      if (items.length === 0) return null;
      return { items, prefix: `@${query}` };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      return combined.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
    },
  };
}

function slashCommands(): SlashCommand[] {
  return SLASH_COMMAND_NAMES.map((name): SlashCommand => ({ name }));
}

function atQuery(textBeforeCursor: string): string | null {
  const match = AT_PREFIX_PATTERN.exec(textBeforeCursor);
  return match === null ? null : (match[1] ?? "");
}

function fileItems(query: string, basePath: string): AutocompleteItem[] {
  const entries = filterFiles(query, scanFiles(basePath).map((file) => ({ path: file.relPath })));
  return entries.slice(0, MAX_SUGGESTIONS).map((entry): AutocompleteItem => ({ value: `@${entry.path}`, label: entry.path }));
}
