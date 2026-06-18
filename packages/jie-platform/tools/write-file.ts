import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types.ts";
import { JiePlatformError } from "../domain-types.ts";
import { mapErrno, resolveWithinWorkspace } from "./path-utils.ts";

const CONTENT_CAP = 5 * 1024 * 1024; // 5 MiB

const WRITE_FILE_DESCRIPTION = `Write \`content\` to \`path\` (relative to workspace root, or absolute within workspace).
Overwrites the file if it exists. Creates parent directories as needed. Text only;
content is written verbatim as UTF-8 bytes. The platform enforces workspace containment
(path_escape on violation) but does NOT check module boundaries — for that, the team
blueprint's role system prompt / descriptor contract applies on top.`;

export interface WriteFileDeps {
  workspaceRoot: string;
}

const ERRNO_MAP: Record<string, string> = {
  EACCES: "permission_denied",
  EISDIR: "is_a_directory",
  ENOSPC: "disk_full",
  EIO: "i_o_error",
  EROFS: "i_o_error",
};

interface WriteFileInput {
  path: string;
  content: string;
}

export function createWriteFileTool(deps: WriteFileDeps): Tool<WriteFileInput> {
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
        throw new JiePlatformError(
          "file_too_large",
          `file_too_large: ${input.content.length}`,
        );
      }

      const real = resolveWithinWorkspace(input.path, deps.workspaceRoot);

      // Reject if the resolved path is an existing directory.
      let stat;
      try {
        stat = statSync(real);
      } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code !== "ENOENT") throw mapErrno(e, ERRNO_MAP);
        stat = null;
      }
      if (stat !== null && stat.isDirectory()) {
        throw new JiePlatformError(
          "is_a_directory",
          `is_a_directory: ${input.path}`,
        );
      }

      // Create missing parent directories.
      try {
        mkdirSync(dirname(real), { recursive: true });
      } catch (e) {
        throw mapErrno(e, ERRNO_MAP);
      }

      try {
        writeFileSync(real, input.content, "utf-8");
      } catch (e) {
        throw mapErrno(e, ERRNO_MAP);
      }

      let createdAt: string;
      try {
        createdAt = statSync(real).mtime.toISOString();
      } catch {
        createdAt = new Date().toISOString();
      }

      return {
        content: `Successfully wrote ${input.content.length} bytes to ${input.path}`,
        details: {
          path: input.path,
          bytes_written: input.content.length,
          created_at: createdAt,
        },
      };
    },
  };
}