import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { filterFiles, type ScannedFile } from "../file-mention";
import type { CompletionSource, JieSuggestions } from "./completion-source";

const MAX_SUGGESTIONS = 20;
const AT_PREFIX_PATTERN = /(?:^|[\s"])@([\w./-]*)$/;

export class FileMentionSource implements CompletionSource {
  readonly triggerCharacters = ["@"];
  readonly exclusive = true;

  constructor(
    private readonly cwd: string,
    private readonly scan: (rootDir: string) => ReadonlyArray<ScannedFile>,
  ) {}

  async getSuggestions(
    lines: string[],
    cursorLine: number,
    cursorCol: number,
    _options: { signal: AbortSignal; force?: boolean },
  ): Promise<JieSuggestions | null> {
    const textBeforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
    const query = atQuery(textBeforeCursor);
    if (query === null) return null;
    const items = fileItems(query, this.scan, this.cwd);
    if (items.length === 0) return null;
    return { items, prefix: `@${query}` };
  }
}

function atQuery(textBeforeCursor: string): string | null {
  const match = AT_PREFIX_PATTERN.exec(textBeforeCursor);
  return match === null ? null : (match[1] ?? "");
}

function fileItems(
  query: string,
  scan: (rootDir: string) => ReadonlyArray<ScannedFile>,
  basePath: string,
): AutocompleteItem[] {
  const entries = filterFiles(query, scan(basePath).map((file) => ({ path: file.relPath })));
  return entries.slice(0, MAX_SUGGESTIONS).map((entry) => ({ value: `@${entry.path}`, label: entry.path }));
}
