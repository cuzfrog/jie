import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBashTool } from "./bash";
import { JiePlatformError } from "../types";
import { makeEmptyContext } from "./_test-context";

describe("bash", () => {
  let workspace: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-bash-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  test("runs a simple command in the workspace root", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute({ command: "echo hello" }, makeEmptyContext());
    expect(result.content).toContain("exit_code: 0");
    expect(result.content).toContain("--- stdout ---");
    expect(result.content).toContain("hello");
    const details = result.details as {
      exitCode: number;
      truncated: { stdout: boolean; stderr: boolean };
    };
    expect(details).toEqual({
      exitCode: 0,
      truncated: { stdout: false, stderr: false },
    });
  });

  test("non-zero exit code is reported in text, not a tool error", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute({ command: "exit 7" }, makeEmptyContext());
    expect(result.content).toContain("exit_code: 7");
    expect(result.content).toContain("(command failed)");
    const details = result.details as { exitCode: number };
    expect(details.exitCode).toBe(7);
  });

  test("stderr is captured in the stderr section; empty sections omitted", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { command: "echo to-out; echo to-err >&2" },
      makeEmptyContext(),
    );
    expect(result.content).toContain("to-out");
    expect(result.content).toContain("to-err");
    expect(result.content).toContain("--- stderr ---");
  });

  test("stdout-only command: stderr section is omitted", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute({ command: "echo only-out" }, makeEmptyContext());
    expect(result.content).toContain("only-out");
    expect(result.content).not.toContain("--- stderr ---");
  });

  test("workdir within workspace is honored", async () => {
    const sub = join(workspace, "sub");
    mkdirSync(sub);
    writeFileSync(join(sub, "marker"), "x");
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { command: "pwd; cat marker", workdir: "sub" },
      makeEmptyContext(),
    );
    expect(result.content).toContain(sub);
    expect(result.content).toContain("x");
  });

  test("workdir outside the workspace is rejected with workdir_escape", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    let caught: unknown;
    try {
      await tool.execute(
        { command: "echo bad", workdir: "/tmp" },
        makeEmptyContext(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiePlatformError);
    expect((caught as JiePlatformError).code).toBe("WORKDIR_ESCAPE");
  });

  test("shell is /bin/sh (POSIX constructs work)", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { command: "if true; then echo yes; fi" },
      makeEmptyContext(),
    );
    expect(result.content).toContain("yes");
  });

  test("stdout truncated at 32 KiB with marker", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute(
      { command: "yes A | head -c 40000" },
      makeEmptyContext(),
    );
    expect(result.content).toContain("[truncated to 32 KiB]");
    const details = result.details as { truncated: { stdout: boolean } };
    expect(details.truncated.stdout).toBe(true);
  });

  test("non-zero exit code from a `false` command has no stdout/stderr", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const result = await tool.execute({ command: "false" }, makeEmptyContext());
    expect(result.content).toContain("exit_code: 1");
    expect(result.content).not.toContain("--- stdout ---");
    expect(result.content).not.toContain("--- stderr ---");
  });

  test("abort signal kills the process; the resulting exit_code is in the content, not command_timed_out", async () => {
    const tool = createBashTool({ workspaceRoot: workspace });
    const ac = new AbortController();
    const resultPromise = tool.execute(
      { command: "sleep 5" },
      makeEmptyContext(),
      ac.signal,
    );
    setTimeout(() => ac.abort(), 50);
    const result = await resultPromise;
    const exitMatch = /exit_code: (\d+)/.exec(result.content);
    expect(exitMatch).not.toBeNull();
    const exitCode = Number(exitMatch![1]);
    expect([137, 143]).toContain(exitCode);
  });
});
