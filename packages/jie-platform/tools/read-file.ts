import { readFileSync, statSync } from "node:fs";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError, JiePlatformErrorMessages } from "../types";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";

const DEFAULT_LINE_CAP = 2000;
const DEFAULT_BYTE_CAP = 50 * 1024;
const TRUNCATION_MARKER = "[Truncated: showing %S of %L lines (50 KiB limit)]";

const READ_FILE_DESCRIPTION = `Read the contents of a file at \`path\` (relative to workspace root, or absolute
within workspace). For text files, output is truncated to 2000 lines or 50 KiB
(whichever is hit first). Use offset/limit for large files. When you need the
full file, continue with offset until complete.`;

export interface ReadFileDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, keyof typeof JiePlatformErrorMessages> = {
  ENOENT: "FILE_NOT_FOUND",
  ENOTDIR: "PATH_ESCAPE",
  EACCES: "PERMISSION_DENIED",
  EISDIR: "IS_A_DIRECTORY",
  EIO: "IO_ERROR",
};

interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
}

function splitLinesPreservingNewline(text: string): string[] {
  const lines: string[] = [];
  let position = 0;
  while (position < text.length) {
    const newlineIndex = text.indexOf("\n", position);
    if (newlineIndex === -1) {
      lines.push(text.substring(position));
      break;
    }
    lines.push(text.substring(position, newlineIndex + 1));
    position = newlineIndex + 1;
  }
  return lines;
}

export function createReadFileTool(dependencies: ReadFileDeps): Tool<ReadFileInput> {
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

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(readFileSync(realPath));
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new JiePlatformError("UNSUPPORTED_ENCODING", { detail: input.path });
      }

      const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);

      const offset =
        input.offset === undefined || input.offset < 1 ? 1 : input.offset;
      const useLimit = input.limit !== undefined && input.limit >= 1;
      const limit = useLimit ? input.limit : undefined;

      const allLines = splitLinesPreservingNewline(text);
      const totalLines = allLines.length;

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
