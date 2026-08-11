import type { AutocompleteSuggestions } from "@earendil-works/pi-tui";

export interface JieSuggestions extends AutocompleteSuggestions {
  readonly filteredOut?: number;
}

export interface CompletionSource {
  readonly triggerCharacters: ReadonlyArray<string>;
  readonly exclusive?: boolean;
  getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null>;
}

