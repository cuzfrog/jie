import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { type ScannedFile } from "./list-files";
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
  const lowerQuery = query.trim().toLowerCase();
  const exact: AutocompleteItem[] = [];
  const prefix: AutocompleteItem[] = [];
  const contains: AutocompleteItem[] = [];
  for (const file of scan(basePath)) {
    const item = { value: `@${file.relPath}`, label: file.relPath };
    if (lowerQuery === "") {
      contains.push(item);
      continue;
    }
    const lower = file.relPath.toLowerCase();
    if (lower === lowerQuery) exact.push(item);
    else if (lower.startsWith(lowerQuery)) prefix.push(item);
    else if (lower.includes(lowerQuery)) contains.push(item);
  }
  return [...exact, ...prefix, ...contains].slice(0, MAX_SUGGESTIONS);
}
