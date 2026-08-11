import { CombinedAutocompleteProvider, type AutocompleteItem, type AutocompleteProvider } from "@earendil-works/pi-tui";
import type { CompletionSource, JieSuggestions } from "./completion-source";

export interface JieAutocompleteProvider extends AutocompleteProvider {
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null>;
}

export class JieAutocompleteProviderImpl implements JieAutocompleteProvider {
  readonly triggerCharacters: string[];
  private readonly applier: CombinedAutocompleteProvider;

  constructor(
    private readonly cwd: string,
    private readonly completionSources: ReadonlyArray<CompletionSource>,
  ) {
    this.triggerCharacters = [...new Set(completionSources.flatMap((source) => [...source.triggerCharacters]))];
    this.applier = new CombinedAutocompleteProvider([], this.cwd, null);
  }

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    const results: JieSuggestions[] = [];
    for (const source of this.completionSources) {
      const result = await source.getSuggestions(lines, cursorLine, cursorCol, options);
      if (result === null) continue;
      if (source.exclusive) return result;
      results.push(result);
    }
    if (results.length === 0) return null;

    const items = results.flatMap((result) => result.items);
    const prefix = results[0]!.prefix;
    const filteredOut = results.reduce((sum, result) => sum + (result.filteredOut ?? 0), 0);
    return {
      items,
      prefix,
      ...(filteredOut > 0 ? { filteredOut } : undefined),
    };
  }

  applyCompletion(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    item: AutocompleteItem,
    prefix: string,
  ): { lines: string[]; cursorLine: number; cursorCol: number } {
    return this.applier.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
  }
}
