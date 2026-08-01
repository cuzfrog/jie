import { tmpdir } from "node:os";
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
    const result = await executor.execute(request("sleep 5", { timeoutMs: 150 }));
    expect(result.timedOut).toBe(true);
  });
});
