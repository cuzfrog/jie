import { readFileSync, statSync, writeFileSync } from "node:fs";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";
import { renderUnifiedDiff } from "./unified-diff";

const EDIT_DESCRIPTION = `Search-and-replace inside a text file. Reads \`path\` (relative to workspace root, or
absolute within workspace), replaces occurrences of \`old_string\` with \`new_string\`, and writes the
result back. If \`old_string\` does not appear the call fails with NO_MATCH. If it appears more
than once and \`replace_all\` is false the call fails with AMBIGUOUS_MATCH (so the model must
either narrow \`old_string\` or opt in to \`replace_all\`). On success returns a unified-diff preview
in \`details.diff\` for the TUI to render; for edits larger than 5000 lines the diff is
omitted and \`details.diff\` is null (use \`write_file\` for wholesale rewrites). Text only; UTF-8.`;

interface EditDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, JiePlatformErrorCode> = {
  ENOENT: "FILE_NOT_FOUND",
  ENOTDIR: "PATH_ESCAPE",
  EACCES: "PERMISSION_DENIED",
  EISDIR: "IS_A_DIRECTORY",
  EIO: "IO_ERROR",
  ENOSPC: "DISK_FULL",
};

interface EditInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface EditResultDetails {
  readonly kind: "diff";
  readonly path: string;
  readonly replacementsCount: number;
  readonly beforeBytes: number;
  readonly afterBytes: number;
  readonly diff: string | null;
}

export function createEditTool(dependencies: EditDeps): Tool<EditInput> {
  return {
    name: "edit",
    description: EDIT_DESCRIPTION,
    label: "Edit File",
    parameters: Type.Object({
      path: Type.String(),
      old_string: Type.String(),
      new_string: Type.String(),
      replace_all: Type.Optional(Type.Boolean()),
    }),
    async execute(input: EditInput): Promise<ToolResult> {
      const realPath = resolveWithinWorkspace(input.path, dependencies.workspaceRoot);
      let stat;
      try {
        stat = statSync(realPath);
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }
      if (stat.isDirectory()) {
        throw new JiePlatformError("IS_A_DIRECTORY", { detail: input.path });
      }

      const bytes = new Uint8Array(readFileSync(realPath));
      let before: string;
      try {
        before = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new JiePlatformError("UNSUPPORTED_ENCODING", { detail: input.path });
      }

      const replaceAll = input.replace_all === true;
      const matches = findAllOccurrences(before, input.old_string);
      if (matches.length === 0) {
        throw new JiePlatformError("NO_MATCH", { detail: input.path });
      }
      if (matches.length > 1 && !replaceAll) {
        throw new JiePlatformError("AMBIGUOUS_MATCH", {
          detail: `${matches.length} matches in ${input.path}`,
        });
      }

      const after = applyReplacements(before, matches, input.old_string, input.new_string, replaceAll);

      try {
        writeFileSync(realPath, after, "utf-8");
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      const replacementsCount = replaceAll ? matches.length : 1;
      const beforeBytes = new TextEncoder().encode(before).length;
      const afterBytes = new TextEncoder().encode(after).length;
      const diff = renderUnifiedDiff(before, after);
      const summary = `Edited ${input.path}: ${replacementsCount} replacement${replacementsCount === 1 ? "" : "s"}`;
      const content = diff === null || diff === "" ? summary : `${summary}\n${diff}`;
      const details: EditResultDetails = {
        kind: "diff",
        path: input.path,
        replacementsCount,
        beforeBytes,
        afterBytes,
        diff,
      };

      return { content, details };
    },
  };
}

function findAllOccurrences(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const out: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    out.push(index);
    index = haystack.indexOf(needle, index + needle.length);
  }
  return out;
}

function applyReplacements(
  before: string,
  matches: ReadonlyArray<number>,
  needle: string,
  replacement: string,
  replaceAll: boolean,
): string {
  const useMatches = replaceAll ? matches : matches.slice(0, 1);
  const parts: string[] = [];
  let cursor = 0;
  for (const matchIndex of useMatches) {
    parts.push(before.substring(cursor, matchIndex));
    parts.push(replacement);
    cursor = matchIndex + needle.length;
  }
  parts.push(before.substring(cursor));
  return parts.join("");
}

