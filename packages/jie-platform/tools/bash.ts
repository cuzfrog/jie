import { realpathSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types.ts";
import { JiePlatformError } from "../domain-types.ts";

const STREAM_CAP = 32 * 1024;
const TRUNCATION_MARKER = "[truncated to 32 KiB]";
const TIMEOUT_MS = 300_000;

const BASH_DESCRIPTION = `Execute a shell command in \`/bin/sh\` (POSIX) within the workspace root. The
command runs with a 300s timeout (SIGTERM, then SIGKILL after a brief grace).
stdout and stderr are each independently truncated to 32 KiB. Output is
formatted as \`exit_code: <N>\` followed by \`--- stdout ---\` and \`--- stderr ---\`
sections (empty sections are omitted). Non-zero exit codes are reported in
the text, not as a typed error — read the \`exit_code\` line. The \`workdir\`
argument, if provided, is resolved relative to the workspace root and must
stay inside it (workspace containment; \`workdir_escape\` on violation). Use
this for arbitrary shell work (running scripts, invoking CLI tools,
inspecting the filesystem, etc.); use \`read_file\` / \`write_file\` for simple
text I/O.`;

export interface BashDeps {
  workspaceRoot: string;
}

interface BashInput {
  command: string;
  workdir?: string;
}

function resolveWorkdir(
  workdir: string | undefined,
  workspaceRoot: string,
): string {
  if (workdir === undefined) return workspaceRoot;
  const rel = isAbsolute(workdir) ? workdir : resolve(workspaceRoot, workdir);
  let real: string;
  try {
    real = realpathSync(rel);
  } catch {
    real = rel;
  }
  const rootReal = realpathSync(workspaceRoot);
  if (real !== rootReal && !real.startsWith(rootReal + "/")) {
    throw new JiePlatformError(
      "workdir_escape",
      `workdir_escape: ${workdir}`,
    );
  }
  return real;
}

function captureStream(buf: Buffer, cap: number): { text: string; truncated: boolean } {
  if (buf.length <= cap) {
    return { text: buf.toString("utf-8"), truncated: false };
  }
  return {
    text: buf.subarray(0, cap).toString("utf-8") + TRUNCATION_MARKER,
    truncated: true,
  };
}

export function createBashTool(dependencies: BashDeps): Tool<BashInput> {
  return {
    name: "bash",
    description: BASH_DESCRIPTION,
    label: "Bash",
    timeout: TIMEOUT_MS,
    parameters: Type.Object({
      command: Type.String(),
      workdir: Type.Optional(Type.String()),
    }),
    async execute(
      input: BashInput,
      _ctx,
      signal?: AbortSignal,
    ): Promise<ToolResult> {
      const cwd = resolveWorkdir(input.workdir, dependencies.workspaceRoot);

      const proc = Bun.spawn(["/bin/sh", "-c", input.command], {
        cwd,
        env: process.env,
        stdout: "pipe",
        stderr: "pipe",
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
          }
        }, 5_000);
      }, TIMEOUT_MS);

      const abortHandler = () => {
        try {
          proc.kill("SIGTERM");
        } catch {
        }
      };
      signal?.addEventListener("abort", abortHandler);

      let stdoutBuf: Buffer = Buffer.alloc(0);
      let stderrBuf: Buffer = Buffer.alloc(0);
      const stdoutReader = (async () => {
        const reader = proc.stdout.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            stdoutBuf = Buffer.concat([stdoutBuf, Buffer.from(value)]);
            if (stdoutBuf.length > STREAM_CAP) {
              try {
                await reader.cancel();
              } catch {
              }
              break;
            }
          }
        } catch {
        }
      })();
      const stderrReader = (async () => {
        const reader = proc.stderr.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            stderrBuf = Buffer.concat([stderrBuf, Buffer.from(value)]);
            if (stderrBuf.length > STREAM_CAP) {
              try {
                await reader.cancel();
              } catch {
              }
              break;
            }
          }
        } catch {
        }
      })();

      const exitCode = await proc.exited;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortHandler);

      const drainTimeout = 500;
      await Promise.race([
        Promise.allSettled([stdoutReader, stderrReader]),
        new Promise((resolve) => setTimeout(resolve, drainTimeout)),
      ]);

      if (timedOut) {
        throw new JiePlatformError(
          "command_timed_out",
          `command_timed_out: ${input.command}`,
        );
      }

      const out = captureStream(stdoutBuf, STREAM_CAP);
      const err = captureStream(stderrBuf, STREAM_CAP);

      const lines: string[] = [];
      const failureSuffix = exitCode !== 0 ? " (command failed)" : "";
      lines.push(`exit_code: ${exitCode}${failureSuffix}`);
      if (out.text.length > 0) {
        lines.push("--- stdout ---");
        lines.push(out.text);
      }
      if (err.text.length > 0) {
        lines.push("--- stderr ---");
        lines.push(err.text);
      }

      return {
        content: lines.join("\n"),
        details: {
          exitCode,
          truncated: { stdout: out.truncated, stderr: err.truncated },
        },
      };
    },
  };
}