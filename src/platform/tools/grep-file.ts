import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace, walkFiles } from "./path-utils";

const DEFAULT_PATH = ".";
const DEFAULT_INCLUDE = "**/*";
const MATCH_CAP = 100;
const FILE_SCAN_CAP = 2000;
const FILE_BYTE_CAP = 1024 * 1024;
const LINE_TRUNC = 500;

const GREP_FILE_DESCRIPTION = `Search file contents for a regex \`pattern\` under \`path\` (a file or directory, defaults to the workspace root). Matches are returned as \`path:line:content\` with 1-indexed line numbers, paths workspace-relative. \`include\` is a glob filtering which files to scan (e.g. \`*.ts\`), defaulting to all files; \`**\` crosses separators. \`ignoreCase\` makes the match case-insensitive. \`node_modules\` and \`.git\` are always pruned, symlinks are not followed, files over 1 MiB or not valid UTF-8 are skipped, and matching lines are truncated to 500 chars. Capped at 100 matches and 2000 files scanned; a footer reports truncation.`;

export interface GrepFileDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, JiePlatformErrorCode> = {
  ENOENT: "FILE_NOT_FOUND",
  EACCES: "PERMISSION_DENIED",
  EIO: "IO_ERROR",
};

interface GrepFileInput {
  pattern: string;
  path?: string;
  include?: string;
  ignoreCase?: boolean;
}

interface GrepMatch {
  readonly path: string;
  readonly line: number;
  readonly content: string;
}

export function createGrepFileTool(dependencies: GrepFileDeps): Tool<GrepFileInput> {
  return {
    name: "grep_file",
    description: GREP_FILE_DESCRIPTION,
    label: "Grep Files",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
      include: Type.Optional(Type.String()),
      ignoreCase: Type.Optional(Type.Boolean()),
    }),
    async execute(
      input: GrepFileInput,
      _executionContext: ExecutionContext,
      signal?: AbortSignal,
    ): Promise<ToolResult> {
      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern, input.ignoreCase === true ? "i" : "");
      } catch (error) {
        throw new JiePlatformError("INVALID_PATTERN", {
          detail: error instanceof Error ? error.message : input.pattern,
        });
      }

      const target = input.path ?? DEFAULT_PATH;
      const { realPath, relativePath } = resolveWithinWorkspace(target, dependencies.workspaceRoot);

      let stat;
      try {
        stat = statSync(realPath);
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      const includeGlob = new Bun.Glob(input.include ?? DEFAULT_INCLUDE);
      const prefix = relativePath === "" ? "" : `${relativePath}/`;
      const matches: GrepMatch[] = [];
      let truncated = false;

      if (stat.isDirectory()) {
        let filesScanned = 0;
        for (const rel of walkFiles(realPath, signal)) {
          if (signal?.aborted) break;
          if (!includeGlob.match(rel)) continue;
          scanFile(join(realPath, rel), prefix === "" ? rel : `${prefix}${rel}`, regex, matches, signal);
          filesScanned++;
          if (matches.length >= MATCH_CAP) {
            truncated = true;
            break;
          }
          if (filesScanned >= FILE_SCAN_CAP) {
            truncated = true;
            break;
          }
        }
      } else {
        scanFile(realPath, relativePath, regex, matches, signal);
      }

      if (matches.length > MATCH_CAP) {
        matches.length = MATCH_CAP;
        truncated = true;
      }

      const footer = truncated
        ? `[showing ${matches.length} of more matches - refine your pattern, path, or include]`
        : `[${matches.length} match${matches.length === 1 ? "" : "es"}]`;
      const content =
        matches.length === 0
          ? `No matches for: ${input.pattern}`
          : `${matches.map((m) => `${m.path}:${m.line}:${m.content}`).join("\n")}\n${footer}`;
      return {
        content,
        details: { kind: "grep", matches, truncated },
      };
    },
  };
}

function scanFile(
  absPath: string,
  displayPath: string,
  regex: RegExp,
  matches: GrepMatch[],
  signal: AbortSignal | undefined,
): void {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(absPath));
  } catch {
    return;
  }
  if (bytes.length > FILE_BYTE_CAP) return;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return;
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (signal?.aborted) return;
    const line = lines[i] as string;
    if (regex.test(line)) {
      const content =
        line.length > LINE_TRUNC ? `${line.slice(0, LINE_TRUNC)}… [truncated]` : line;
      matches.push({ path: displayPath, line: i + 1, content });
    }
  }
}
