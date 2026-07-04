import { runPrint } from "./print";
import type { PrintResult } from "@cuzfrog/jie-platform/command";

function makeHandle(result: PrintResult): {
  handle: { command: ReturnType<typeof vi.fn> };
  command: ReturnType<typeof vi.fn>;
} {
  const command = vi.fn().mockResolvedValue(result);
  return {
    handle: { command },
    command,
  };
}

const baseArgs = (overrides: Partial<Parameters<typeof runPrint>[1]> = {}): Parameters<typeof runPrint>[1] => ({
  kind: "print",
  instruction: "hi",
  team: undefined,
  timeout: 30,
  json: false,
  apiKey: undefined,
  resume: undefined,
  continueLast: false,
  ...overrides,
});

describe("runPrint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("ok result -> exit code 0", async () => {
    const { handle, command } = makeHandle({ kind: "ok" });
    const code = await runPrint(
      handle as never,
      baseArgs({ instruction: "hello" }),
    );
    expect(code).toBe(0);
    expect(command).toHaveBeenCalledWith("print", { instruction: "hello", timeout: 30, json: false });
  });

  test("timeout result -> exit code 3 with stderr message", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handle } = makeHandle({ kind: "timeout" });
    const code = await runPrint(
      handle as never,
      baseArgs({ timeout: 7 }),
    );
    expect(code).toBe(3);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("no response from team within 7s");
    errSpy.mockRestore();
  });

  test("error result -> exit code 1 with stderr message", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { handle } = makeHandle({ kind: "error", message: "no leader" });
    const code = await runPrint(
      handle as never,
      baseArgs(),
    );
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("no leader");
    errSpy.mockRestore();
  });

  test("json flag is forwarded to the dispatcher", async () => {
    const { handle, command } = makeHandle({ kind: "ok" });
    await runPrint(
      handle as never,
      baseArgs({ json: true, instruction: "x" }),
    );
    expect(command).toHaveBeenCalledWith("print", { instruction: "x", timeout: 30, json: true });
  });
});
