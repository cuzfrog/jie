import { mkdirSync, readFileSync, statSync, writeFileSync, type Stats } from "node:fs";
import { dirname } from "node:path";
import { Type } from "typebox";
import { isErrnoException } from "..";
import type { ExecutionContext, Tool, ToolResult, WriteFileResultDetails } from "./types";
import { JiePlatformError, type JiePlatformErrorCode } from "../jie-platform-errors";
import type { FileMutationQueue } from "./file-mutation-queue";
import { expandMentionPath } from "./mention-path";
import { mapErrno, resolveWithinWorkspace } from "./path-utils";
import { renderUnifiedDiff } from "./unified-diff";

const CONTENT_CAP = 5 * 1024 * 1024;

const WRITE_FILE_DESCRIPTION = `Write content to a file (path relative to the workspace root), overwriting if it
exists; creates parent directories. UTF-8 text.`;

export interface WriteFileDeps {
  workspaceRoot: string;
  fileMutationQueue: FileMutationQueue;
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
    async execute(input: WriteFileInput, executionContext: ExecutionContext): Promise<ToolResult> {
      if (input.content.length > CONTENT_CAP) {
        throw new JiePlatformError("FILE_TOO_LARGE", { detail: `${input.content.length}` });
      }

      const path = expandMentionPath(input.path, dependencies.workspaceRoot);
      const { realPath, relativePath } = resolveWithinWorkspace(path, dependencies.workspaceRoot);
      const globs = executionContext.toolArgs.get("write_file");
      if (globs !== undefined && !globs.some((pattern) => new Bun.Glob(pattern).match(relativePath))) {
        throw new JiePlatformError("WRITE_PATH_DENIED", {
          detail: `path '${relativePath}' is not allowed for role '${executionContext.agentRole}'`,
        });
      }
      return dependencies.fileMutationQueue.run(realPath, () => applyWrite(input, realPath));
    },
  };
}

async function applyWrite(input: WriteFileInput, realPath: string): Promise<ToolResult> {
  let stat;
  try {
    stat = statSync(realPath);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      stat = null;
    } else {
      throw mapErrno(error, ERRNO_MAP);
    }
  }
  if (stat !== null && stat.isDirectory()) {
    throw new JiePlatformError("IS_A_DIRECTORY", { detail: input.path });
  }

  const before = readBeforeContent(realPath, stat);
  if (before !== null && before === input.content) {
    throw new JiePlatformError("NO_CHANGES", { detail: input.path });
  }

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
