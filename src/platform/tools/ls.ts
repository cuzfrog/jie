import { readdirSync, statSync } from "node:fs";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";

const DEFAULT_PATH = ".";
const ENTRY_CAP = 500;

const LS_DESCRIPTION = `List the direct children of a directory at \`path\` (relative to workspace root, or absolute within workspace); defaults to the workspace root. Directories are suffixed with \`/\`, symlinks with \`@\`, files are plain. Entries are sorted directories first, then symlinks, then files. Output is capped at 500 entries; a footer reports the total and truncation. Non-recursive - use find_file to search the tree recursively.`;

export interface LsDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, JiePlatformErrorCode> = {
  ENOENT: "FILE_NOT_FOUND",
  ENOTDIR: "NOT_A_DIRECTORY",
  EACCES: "PERMISSION_DENIED",
  EIO: "IO_ERROR",
};

interface LsInput {
  path?: string;
}

export function createLsTool(dependencies: LsDeps): Tool<LsInput> {
  return {
    name: "ls",
    description: LS_DESCRIPTION,
    label: "List Directory",
    parameters: Type.Object({
      path: Type.Optional(Type.String()),
    }),
    async execute(input: LsInput): Promise<ToolResult> {
      const target = input.path ?? DEFAULT_PATH;
      const { realPath } = resolveWithinWorkspace(target, dependencies.workspaceRoot);

      let stat;
      try {
        stat = statSync(realPath);
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }
      if (!stat.isDirectory()) {
        throw new JiePlatformError("NOT_A_DIRECTORY", { detail: target });
      }

      let entries;
      try {
        entries = readdirSync(realPath, { withFileTypes: true });
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      const dirs: string[] = [];
      const links: string[] = [];
      const files: string[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) dirs.push(`${entry.name}/`);
        else if (entry.isSymbolicLink()) links.push(`${entry.name}@`);
        else if (entry.isFile()) files.push(entry.name);
      }
      dirs.sort();
      links.sort();
      files.sort();
      const all = [...dirs, ...links, ...files];

      const total = all.length;
      const truncated = total > ENTRY_CAP;
      const shown = truncated ? all.slice(0, ENTRY_CAP) : all;
      const footer = truncated
        ? `[showing ${ENTRY_CAP} of ${total} entries]`
        : `[${total} entr${total === 1 ? "y" : "ies"}]`;
      const content = shown.length === 0 ? footer : `${shown.join("\n")}\n${footer}`;
      return {
        content,
        details: { kind: "ls", truncated },
      };
    },
  };
}
