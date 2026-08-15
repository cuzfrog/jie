import { statSync } from "node:fs";
import { Type } from "typebox";
import type { ExecutionContext, Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { expandMentionPath } from "./mention-path";
import { mapErrno, resolveWithinWorkspace, walkFiles } from "./path-utils";

const DEFAULT_PATH = ".";
const MATCH_CAP = 100;

const FIND_FILE_DESCRIPTION = `Find files matching a glob \`pattern\` recursively under \`path\` (defaults to the
workspace root). \`*\` matches within one path segment, \`**\` crosses separators.
Results are workspace-relative. \`node_modules\` and \`.git\` are pruned; symlinks
are not followed. Capped at 100 matches. Use ls for a single directory listing.`;

export interface FindFileDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, JiePlatformErrorCode> = {
  ENOENT: "FILE_NOT_FOUND",
  ENOTDIR: "NOT_A_DIRECTORY",
  EACCES: "PERMISSION_DENIED",
  EIO: "IO_ERROR",
};

interface FindFileInput {
  pattern: string;
  path?: string;
}

export function createFindFileTool(dependencies: FindFileDeps): Tool<FindFileInput> {
  return {
    name: "find_file",
    description: FIND_FILE_DESCRIPTION,
    label: "Find Files",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
    }),
    async execute(
      input: FindFileInput,
      _executionContext: ExecutionContext,
      signal?: AbortSignal,
    ): Promise<ToolResult> {
      const target = input.path ?? DEFAULT_PATH;
      const path = expandMentionPath(target, dependencies.workspaceRoot);
      const { realPath, relativePath } = resolveWithinWorkspace(path, dependencies.workspaceRoot);

      let stat;
      try {
        stat = statSync(realPath);
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }
      if (!stat.isDirectory()) {
        throw new JiePlatformError("NOT_A_DIRECTORY", { detail: target });
      }

      const glob = new Bun.Glob(input.pattern);
      const prefix = relativePath === "" ? "" : `${relativePath}/`;
      const matches: string[] = [];
      for (const rel of walkFiles(realPath, signal)) {
        if (glob.match(rel)) {
          matches.push(prefix === "" ? rel : `${prefix}${rel}`);
          if (matches.length >= MATCH_CAP) break;
        }
      }
      matches.sort();

      const truncated = matches.length >= MATCH_CAP;
      const footer = truncated
        ? `[showing first ${MATCH_CAP} matches - refine your pattern]`
        : `[${matches.length} match${matches.length === 1 ? "" : "es"}]`;
      const content =
        matches.length === 0
          ? `No files matching: ${input.pattern}`
          : `${matches.join("\n")}\n${footer}`;
      return {
        content,
        details: { kind: "find", matches, truncated },
      };
    },
  };
}
