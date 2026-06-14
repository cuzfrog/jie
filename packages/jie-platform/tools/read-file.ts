import { readFileSync, statSync } from "node:fs";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types.ts";
import { JiePlatformError } from "../storage/domain-types.ts";
import { mapErrno, resolveWithinWorkspace } from "./path-utils.ts";

const DEFAULT_LINE_CAP = 2000;
const DEFAULT_BYTE_CAP = 50 * 1024; // 50 KiB
const TRUNCATION_MARKER = "[Truncated: showing %S of %L lines (50 KiB limit)]";

const READ_FILE_DESCRIPTION = `Read the contents of a file at \`path\` (relative to workspace root, or absolute
within workspace). For text files, output is truncated to 2000 lines or 50 KiB
(whichever is hit first). Use offset/limit for large files. When you need the
full file, continue with offset until complete.`;

export interface ReadFileDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, string> = {
  ENOENT: "file_not_found",
  ENOTDIR: "path_escape",
  EACCES: "permission_denied",
  EISDIR: "is_a_directory",
  EIO: "i_o_error",
};

interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
}

/** Split a string into lines, keeping each line's trailing newline.
 *  "a\nb\n" -> ["a\n", "b\n"]; "a\nb" -> ["a\n", "b"]. */
function splitLinesPreservingNewline(text: string): string[] {
  const lines: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const nl = text.indexOf("\n", pos);
    if (nl === -1) {
      lines.push(text.substring(pos));
      break;
    }
    lines.push(text.substring(pos, nl + 1));
    pos = nl + 1;
  }
  return lines;
}

export function createReadFileTool(deps: ReadFileDeps): Tool<ReadFileInput> {
  return {
    name: "read_file",
    description: READ_FILE_DESCRIPTION,
    label: "Read File",
    parameters: Type.Object({
      path: Type.String(),
      offset: Type.Optional(Type.Number()),
      limit: Type.Optional(Type.Number()),
    }),
    async execute(input: ReadFileInput): Promise<ToolResult> {
      const real = resolveWithinWorkspace(input.path, deps.workspaceRoot);

      let stat;
      try {
        stat = statSync(real);
      } catch (e) {
        throw mapErrno(e, ERRNO_MAP);
      }
      if (stat.isDirectory()) {
        throw new JiePlatformError(
          "is_a_directory",
          `is_a_directory: ${input.path}`,
        );
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(readFileSync(real));
      } catch (e) {
        throw mapErrno(e, ERRNO_MAP);
      }

      // UTF-8 validity check (fatal: true throws on invalid byte sequence).
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new JiePlatformError(
          "unsupported_encoding",
          `unsupported_encoding: ${input.path}`,
        );
      }

      // Per spec: preserve the UTF-8 BOM as a single U+FEFF char.
      // `ignoreBOM: true` keeps it (the WHATWG naming is inverted:
      // `ignoreBOM: true` means "do not strip the BOM"; the default
      // strips it).
      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

      // Clamp offset (>= 1) and limit (>= 1, 0 means unset).
      const offset =
        input.offset === undefined || input.offset < 1 ? 1 : input.offset;
      const useLimit = input.limit !== undefined && input.limit >= 1;
      const limit = useLimit ? input.limit : undefined;

      // Split into lines, preserving trailing newlines so that a
      // file ending in "\n" round-trips and a `limit: N` truncation
      // keeps the trailing newline of the Nth line.
      const allLines = splitLinesPreservingNewline(text);
      const totalLines = allLines.length;

      // offset is 1-indexed. If offset > totalLines, the file is
      // exhausted before any line is read.
      if (offset > totalLines) {
        return {
          content: "",
          details: { truncated: { content: false } },
        };
      }

      const startIndex = offset - 1;
      const endIndex = useLimit
        ? Math.min(startIndex + (limit as number), totalLines)
        : totalLines;
      let sliced = allLines.slice(startIndex, endIndex);

      // Apply default line / byte cap.
      const lineCap = useLimit ? sliced.length : DEFAULT_LINE_CAP;
      let contentLineCount = sliced.length;
      let truncated = false;
      if (sliced.length > lineCap) {
        sliced = sliced.slice(0, lineCap);
        contentLineCount = lineCap;
        truncated = true;
      }
      let content = sliced.join("");

      if (content.length > DEFAULT_BYTE_CAP) {
        content = content.slice(0, DEFAULT_BYTE_CAP);
        truncated = true;
      }

      if (truncated) {
        const marker = TRUNCATION_MARKER.replace("%S", String(contentLineCount))
          .replace("%L", String(totalLines));
        content = `${content}\n${marker}`;
      }

      return {
        content,
        details: { truncated: { content: truncated } },
      };
    },
  };
}