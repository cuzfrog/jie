import { createBunSubprocessFactory } from "./subprocess";

describe("createBunSubprocessFactory", () => {
  test("spawns a process and round-trips stdin through stdout", async () => {
    const factory = createBunSubprocessFactory();
    const proc = factory.spawn("cat", []);

    const data: string[] = [];
    let exitCode: number | null = -1;
    proc.onData((chunk) => data.push(chunk));
    proc.onExit((code) => { exitCode = code; });

    proc.write("hello mcp");
    proc.endStdin();

    await new Promise<void>((resolve) => {
      const check = () => {
        if (exitCode !== -1) return resolve();
        setTimeout(check, 10);
      };
      setTimeout(check, 10);
    });

    expect(data.join("")).toBe("hello mcp");
    expect(exitCode).toBe(0);
  });

  test("kill terminates the process and reports a non-zero or null exit", async () => {
    const factory = createBunSubprocessFactory();
    const proc = factory.spawn("sleep", ["1"]);

    let exited = false;
    let exitCode: number | null = null;
    proc.onExit((code) => { exited = true; exitCode = code; });

    proc.kill();

    await new Promise<void>((resolve) => {
      const check = () => {
        if (exited) return resolve();
        setTimeout(check, 10);
      };
      setTimeout(check, 10);
    });

    expect(exited).toBe(true);
  });

  test("can replace the data handler after the process starts", async () => {
    const factory = createBunSubprocessFactory();
    const proc = factory.spawn("cat", []);

    const data: string[] = [];
    let exitCode: number | null = -1;
    proc.write("delayed handler");
    proc.endStdin();

    proc.onData((chunk) => data.push(chunk));
    proc.onExit((code) => { exitCode = code; });

    await new Promise<void>((resolve) => {
      const check = () => {
        if (exitCode !== -1) return resolve();
        setTimeout(check, 10);
      };
      setTimeout(check, 10);
    });

    expect(data.join("")).toBe("delayed handler");
    expect(exitCode).toBe(0);
  });
});
