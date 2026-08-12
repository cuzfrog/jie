import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import type { CompletionSource, JieSuggestions } from "./completion-source";

export class PathCompletionSource implements CompletionSource {
  readonly triggerCharacters: string[] = [];
  private readonly combined: CombinedAutocompleteProvider;

  constructor(cwd: string) {
    this.combined = new CombinedAutocompleteProvider([], cwd, null);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    const suggestions = await this.combined.getSuggestions(lines, cursorLine, cursorCol, options);
    if (suggestions === null) return null;
    return suggestions;
  }
}
