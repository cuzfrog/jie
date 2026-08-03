import { mkdirSync, readFileSync, statSync, writeFileSync, type Stats } from "node:fs";
import { dirname } from "node:path";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";
import { renderUnifiedDiff } from "./unified-diff";

const CONTENT_CAP = 5 * 1024 * 1024;

const WRITE_FILE_DESCRIPTION = `Write \`content\` to \`path\` (relative to workspace root, or absolute within workspace).
Overwrites the file if it exists. Creates parent directories as needed. Text only;
content is written verbatim as UTF-8 bytes. The platform enforces workspace containment
(path_escape on violation) but does NOT check module boundaries — for that, the team
blueprint's role system prompt / descriptor contract applies on top.`;

export interface WriteFileDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, JiePlatformErrorCode> = {
  EACCES: "PERMISSION_DENIED",
  EISDIR: "IS_A_DIRECTORY",
  ENOSPC: "DISK_FULL",
  EIO: "IO_ERROR",
  EROFS: "IO_ERROR",
};

interface WriteFileInput {
  path: string;
  content: string;
}

export function createWriteFileTool(dependencies: WriteFileDeps): Tool<WriteFileInput> {
  return {
    name: "write_file",
    description: WRITE_FILE_DESCRIPTION,
    label: "Write File",
    parameters: Type.Object({
      path: Type.String(),
      content: Type.String(),
    }),
    async execute(input: WriteFileInput): Promise<ToolResult> {
      if (input.content.length > CONTENT_CAP) {
        throw new JiePlatformError("FILE_TOO_LARGE", { detail: `${input.content.length}` });
      }

      const realPath = resolveWithinWorkspace(input.path, dependencies.workspaceRoot);

      let stat;
      try {
        stat = statSync(realPath);
      } catch (error) {
        const errno = error as NodeJS.ErrnoException;
        if (errno.code !== "ENOENT") throw mapErrno(error, ERRNO_MAP);
        stat = null;
      }
      if (stat !== null && stat.isDirectory()) {
        throw new JiePlatformError("IS_A_DIRECTORY", { detail: input.path });
      }

      const before = readBeforeContent(realPath, stat);

      try {
        mkdirSync(dirname(realPath), { recursive: true });
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      try {
        writeFileSync(realPath, input.content, "utf-8");
      } catch (error) {
        throw mapErrno(error, ERRNO_MAP);
      }

      let createdAt: string;
      try {
        createdAt = statSync(realPath).mtime.toISOString();
      } catch {
        createdAt = new Date().toISOString();
      }

      const bytesWritten = new TextEncoder().encode(input.content).length;
      const details: WriteFileResultDetails = {
        kind: "diff",
        path: input.path,
        bytesWritten,
        createdAt,
        diff: before === null ? null : renderUnifiedDiff(before, input.content),
      };
      return {
        content: `Successfully wrote ${bytesWritten} bytes to ${input.path}`,
        details,
      };
    },
  };
}

interface WriteFileResultDetails {
  readonly kind: "diff";
  readonly path: string;
  readonly bytesWritten: number;
  readonly createdAt: string;
  readonly diff: string | null;
}

function readBeforeContent(realPath: string, stat: Stats | null): string | null {
  if (stat === null) return "";
  if (stat.size > CONTENT_CAP) return null;
  try {
    const bytes = new Uint8Array(readFileSync(realPath));
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return null;
  }
}
