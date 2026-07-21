export interface FileEntry {
  readonly path: string;
}

export function filterFiles(query: string, files: ReadonlyArray<FileEntry>): ReadonlyArray<FileEntry> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return files;
  const exact: FileEntry[] = [];
  const prefix: FileEntry[] = [];
  const contains: FileEntry[] = [];
  for (const entry of files) {
    const lower = entry.path.toLowerCase();
    if (lower === trimmed) exact.push(entry);
    else if (lower.startsWith(trimmed)) prefix.push(entry);
    else if (lower.includes(trimmed)) contains.push(entry);
  }
  return [...exact, ...prefix, ...contains];
}
