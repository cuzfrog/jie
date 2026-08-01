import type { CommandExecutor, HookCommandRequest, HookCommandResult } from "./types";

const KILL_GRACE_MS = 5_000;
const DRAIN_TIMEOUT_MS = 500;

export class ShCommandExecutor implements CommandExecutor {
  async execute(request: HookCommandRequest): Promise<HookCommandResult> {
    const proc = Bun.spawn(["/bin/sh", "-c", request.command], {
      cwd: request.cwd,
      env: process.env,
      stdin: new TextEncoder().encode(request.stdin),
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
      }, KILL_GRACE_MS);
    }, request.timeoutMs);

    const stdout = readStream(proc.stdout);
    const stderr = readStream(proc.stderr);
    const exitCode = await proc.exited;
    clearTimeout(timer);
    const [stdoutText, stderrText] = await Promise.race([
      Promise.all([stdout, stderr]),
      new Promise<[string, string]>((resolve) => setTimeout(() => resolve(["", ""]), DRAIN_TIMEOUT_MS)),
    ]);
    return { exitCode: exitCode ?? 1, stdout: stdoutText, stderr: stderrText, timedOut };
  }
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } catch {
  }
  return new TextDecoder().decode(concatChunks(chunks));
}

function concatChunks(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  let length = 0;
  for (const chunk of chunks) length += chunk.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}
