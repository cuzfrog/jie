import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import type { CompletionSource, JieSuggestions } from "./completion-source";

export class PathCompletionSource implements CompletionSource {
  readonly triggerCharacters: ReadonlyArray<string> = [];

  constructor(private readonly provider: AutocompleteProvider) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    const suggestions = await this.provider.getSuggestions(lines, cursorLine, cursorCol, options);
    if (suggestions === null) return null;
    return suggestions;
  }
}
