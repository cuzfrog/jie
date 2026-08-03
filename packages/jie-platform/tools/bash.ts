import { realpathSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";

const STREAM_CAP = 32 * 1024;
const TRUNCATION_MARKER = "[truncated to 32 KiB]";
const TIMEOUT_MS = 300_000;
const KILL_GRACE_MS = 5_000;
const DRAIN_TIMEOUT_MS = 500;

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
      _executionContext,
      signal?: AbortSignal,
    ): Promise<ToolResult> {
      const cwd = resolveWorkdir(input.workdir, dependencies.workspaceRoot);

      const proc = Bun.spawn(["/bin/sh", "-c", input.command], {
        cwd,
        env: process.env,
        detached: true,
        stdout: "pipe",
        stderr: "pipe",
      });

      let timedOut = false;
      let killing = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const killWithEscalation = () => {
        if (killing) return;
        killing = true;
        killProcessGroup(proc.pid, "SIGTERM");
        killTimer = setTimeout(() => killProcessGroup(proc.pid, "SIGKILL"), KILL_GRACE_MS);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killWithEscalation();
      }, TIMEOUT_MS);

      signal?.addEventListener("abort", killWithEscalation);

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
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", killWithEscalation);

      let drainTimer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.allSettled([stdoutReader, stderrReader]),
        new Promise<void>((resolve) => {
          drainTimer = setTimeout(resolve, DRAIN_TIMEOUT_MS);
        }),
      ]);
      clearTimeout(drainTimer);

      if (timedOut) {
        throw new JiePlatformError("COMMAND_TIMED_OUT", { detail: input.command });
      }

      const out = captureStream(stdoutBuf, STREAM_CAP);
      const errStream = captureStream(stderrBuf, STREAM_CAP);

      const lines: string[] = [];
      const failureSuffix = exitCode !== 0 ? " (command failed)" : "";
      lines.push(`exit_code: ${exitCode}${failureSuffix}`);
      if (out.text.length > 0) {
        lines.push("--- stdout ---");
        lines.push(out.text);
      }
      if (errStream.text.length > 0) {
        lines.push("--- stderr ---");
        lines.push(errStream.text);
      }

      return {
        content: lines.join("\n"),
        details: {
          exitCode,
          truncated: { stdout: out.truncated, stderr: errStream.truncated },
        },
      };
    },
  };
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
    throw new JiePlatformError("WORKDIR_ESCAPE", { detail: workdir });
  }
  return real;
}

function killProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
  }
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
