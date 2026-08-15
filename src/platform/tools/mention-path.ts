import { existsSync } from "node:fs";
import { join } from "node:path";
import { JiePlatformError } from "../jie-platform-errors";
import { scanFiles, type ScannedFile } from "../../utils";

export function expandMentionPath(path: string, workspaceRoot: string): string {
  const mention = parseMention(path);
  if (mention === null) return path;
  const { onlyIgnored, query } = mention;
  const direct = join(workspaceRoot, query);
  if (existsSync(direct)) return query;
  const candidates = scanFiles(workspaceRoot, { onlyIgnored });
  const matches = matchMention(query, candidates);
  if (matches.length === 1) return matches[0]!.relPath;
  if (matches.length > 1) {
    const list = matches
      .slice(0, 5)
      .map((file) => file.relPath)
      .join(", ");
    throw new JiePlatformError("FILE_NOT_FOUND", {
      detail: `ambiguous mention ${path}; candidates: ${list}`,
    });
  }
  return query;
}

function parseMention(path: string): { readonly onlyIgnored: boolean; readonly query: string } | null {
  if (path.startsWith("@@")) return { onlyIgnored: true, query: path.slice(2) };
  if (path.startsWith("@")) return { onlyIgnored: false, query: path.slice(1) };
  return null;
}

function matchMention(query: string, candidates: ReadonlyArray<ScannedFile>): ReadonlyArray<ScannedFile> {
  const lowerQuery = query.toLowerCase();
  const exact = candidates.filter((file) => file.relPath === query);
  if (exact.length > 0) return exact;
  const exactCaseInsensitive = candidates.filter((file) => file.relPath.toLowerCase() === lowerQuery);
  if (exactCaseInsensitive.length > 0) return exactCaseInsensitive;
  const suffix = candidates.filter((file) => file.relPath.endsWith(`/${query}`));
  if (suffix.length > 0) return suffix;
  const suffixCaseInsensitive = candidates.filter((file) => file.relPath.toLowerCase().endsWith(`/${lowerQuery}`));
  if (suffixCaseInsensitive.length > 0) return suffixCaseInsensitive;
  return [];
}

export { parseMention as _parseMention, matchMention as _matchMention };
