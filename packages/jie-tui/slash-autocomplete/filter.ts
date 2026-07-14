export function filterCommands(query: string, commands: ReadonlyArray<string>): ReadonlyArray<string> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return commands;
  const exact: string[] = [];
  const prefixMatches: string[] = [];
  for (const name of commands) {
    const lower = name.toLowerCase();
    if (lower === trimmed) {
      exact.push(name);
    } else if (lower.startsWith(trimmed)) {
      prefixMatches.push(name);
    }
  }
  return [...exact, ...prefixMatches];
}
