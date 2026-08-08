import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShCommandExecutor } from "./command-executor";
import type { HookCommandRequest } from "./types";

function request(command: string, overrides: Partial<HookCommandRequest> = {}): HookCommandRequest {
  return { command, timeoutMs: 5000, stdin: "", cwd: tmpdir(), ...overrides };
}

const executor = new ShCommandExecutor();

describe("ShCommandExecutor", () => {
  test("captures stdout and a zero exit code", async () => {
    const result = await executor.execute(request("echo hello"));
    expect(result.stdout.trim()).toBe("hello");
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
  });

  test("propagates a non-zero exit code", async () => {
    const result = await executor.execute(request("exit 3"));
    expect(result.exitCode).toBe(3);
  });

  test("delivers stdin to the command", async () => {
    const result = await executor.execute(request("cat", { stdin: "payload" }));
    expect(result.stdout).toBe("payload");
  });

  test("captures stderr separately", async () => {
    const result = await executor.execute(request("echo oops 1>&2"));
    expect(result.stderr.trim()).toBe("oops");
  });

  test("kills a long-running command and reports timedOut", async () => {
    const result = await executor.execute(request("sleep 1", { timeoutMs: 50 }));
    expect(result.timedOut).toBe(true);
  });

  test("timeout kill reaches backgrounded descendants, not just the shell", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jie-executor-kill-"));
    const marker = join(dir, "marker");
    try {
      const result = await executor.execute(request(`(sleep 0.1; touch ${marker}) & wait`, { timeoutMs: 50, cwd: dir }));
      expect(result.timedOut).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a spawn failure resolves as a non-zero result with the error on stderr", async () => {
    const result = await executor.execute(request("true", { cwd: "/definitely/not/a/directory" }));
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).not.toBe("");
    expect(result.timedOut).toBe(false);
  });
});
